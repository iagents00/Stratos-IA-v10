-- expediente_items: enable advisor edit/delete permissions with soft-delete + recovery
--
-- Cambios:
--   1. Columnas de soft-delete: deleted_at, deleted_by, deleted_reason.
--   2. Índices parciales para notas activas vs. eliminadas.
--   3. RLS:
--        - SELECT: admin ve todo (incluye soft-deleted para recuperar); asesor ve
--          notas activas que él creó o de leads asignados a él.
--        - UPDATE: admin, autor de la nota, o asesor del lead.
--        - DELETE: bloqueado (no hard-delete). Sólo soft-delete vía UPDATE.
--   4. audit_trigger_func: detecta acción RESTORE (deleted_at NOT NULL -> NULL).
--   5. RPCs:
--        - soft_delete_expediente_item(p_item_id, p_reason)
--        - restore_expediente_item(p_item_id)               -- admin
--        - list_deleted_expediente_items(p_lead_id)         -- admin

-- 1) Columnas
ALTER TABLE public.expediente_items
  ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by     UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

-- 2) Índices
DROP INDEX IF EXISTS public.idx_expediente_lead;
CREATE INDEX IF NOT EXISTS idx_expediente_lead_active
  ON public.expediente_items (lead_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_expediente_deleted
  ON public.expediente_items (organization_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 3) Helper: ¿el caller es el asesor asignado al lead?
CREATE OR REPLACE FUNCTION public.is_lead_asesor(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id
      AND asesor_id = auth.uid()
      AND deleted_at IS NULL
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_lead_asesor(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_lead_asesor(uuid) TO authenticated;

-- 4) RLS policies (reemplazo)
DROP POLICY IF EXISTS expediente_select        ON public.expediente_items;
DROP POLICY IF EXISTS expediente_insert        ON public.expediente_items;
DROP POLICY IF EXISTS expediente_update        ON public.expediente_items;
DROP POLICY IF EXISTS expediente_delete        ON public.expediente_items;
DROP POLICY IF EXISTS expediente_no_hard_delete ON public.expediente_items;

CREATE POLICY expediente_select
  ON public.expediente_items
  FOR SELECT
  TO authenticated
  USING (
    organization_id = current_organization_id()
    AND (
      is_admin_or_above()
      OR (
        deleted_at IS NULL
        AND (
          asesor_id = auth.uid()
          OR public.is_lead_asesor(lead_id)
        )
      )
    )
  );

CREATE POLICY expediente_insert
  ON public.expediente_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NULL
    OR organization_id = current_organization_id()
  );

CREATE POLICY expediente_update
  ON public.expediente_items
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = current_organization_id()
    AND (
      is_admin_or_above()
      OR asesor_id = auth.uid()
      OR public.is_lead_asesor(lead_id)
    )
  )
  WITH CHECK (
    organization_id = current_organization_id()
    AND (
      is_admin_or_above()
      OR asesor_id = auth.uid()
      OR public.is_lead_asesor(lead_id)
    )
  );

-- Sin hard-delete: cualquier DELETE directo es rechazado.
CREATE POLICY expediente_no_hard_delete
  ON public.expediente_items
  FOR DELETE
  TO authenticated
  USING (false);

-- 5a) Permitir 'RESTORE' en el CHECK constraint de audit_log.
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_action_check
  CHECK (action = ANY (ARRAY[
    'INSERT'::text, 'UPDATE'::text, 'DELETE'::text,
    'SOFT_DELETE'::text, 'RESTORE'::text,
    'LOGIN'::text, 'LOGIN_FAIL'::text, 'LOGOUT'::text,
    'SIGNUP'::text, 'PASSWORD_RESET'::text
  ]));

-- 5b) Audit trigger: reconocer RESTORE además del SOFT_DELETE existente.
--    También fijamos search_path para cerrar la advertencia 0011 del linter.
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_actor_id uuid; v_actor_name text; v_actor_role text;
  v_org_id uuid; v_changed jsonb; v_action text; v_entity_id uuid;
  v_old jsonb; v_new jsonb;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NOT NULL THEN
    SELECT name, role, organization_id INTO v_actor_name, v_actor_role, v_org_id
    FROM public.profiles WHERE id = v_actor_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN v_old := to_jsonb(OLD); END IF;

  IF v_new IS NOT NULL AND v_new ? 'organization_id' THEN
    v_org_id := COALESCE((v_new->>'organization_id')::uuid, v_org_id);
  ELSIF v_old IS NOT NULL AND v_old ? 'organization_id' THEN
    v_org_id := COALESCE((v_old->>'organization_id')::uuid, v_org_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT'; v_entity_id := NEW.id;
    v_changed := (SELECT jsonb_object_agg(key, jsonb_build_object('old', null, 'new', value))
      FROM jsonb_each(v_new)
      WHERE key NOT IN ('created_at','updated_at') AND value IS NOT NULL AND value::text != 'null');
  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := NEW.id;
    IF (v_old ? 'deleted_at') AND (v_old->>'deleted_at') IS NULL AND (v_new->>'deleted_at') IS NOT NULL THEN
      v_action := 'SOFT_DELETE';
    ELSIF (v_old ? 'deleted_at') AND (v_old->>'deleted_at') IS NOT NULL AND (v_new->>'deleted_at') IS NULL THEN
      v_action := 'RESTORE';
    ELSE
      v_action := 'UPDATE';
    END IF;
    v_changed := (SELECT jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value))
      FROM jsonb_each(v_new) n LEFT JOIN jsonb_each(v_old) o ON o.key = n.key
      WHERE n.value IS DISTINCT FROM o.value AND n.key NOT IN ('updated_at'));
    IF v_changed IS NULL OR v_changed = '{}'::jsonb THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE'; v_entity_id := OLD.id;
    v_changed := (SELECT jsonb_object_agg(key, jsonb_build_object('old', value, 'new', null))
      FROM jsonb_each(v_old)
      WHERE key NOT IN ('created_at','updated_at') AND value IS NOT NULL AND value::text != 'null');
  END IF;

  INSERT INTO public.audit_log
    (actor_id, actor_name, actor_role, organization_id, entity_type, entity_id, action, changed_fields)
  VALUES (v_actor_id, v_actor_name, v_actor_role, v_org_id, TG_TABLE_NAME, v_entity_id, v_action, v_changed);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 6) RPC: soft_delete_expediente_item
CREATE OR REPLACE FUNCTION public.soft_delete_expediente_item(
  p_item_id uuid,
  p_reason  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_item   public.expediente_items%ROWTYPE;
  v_lead_asesor uuid;
  v_org uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_item FROM public.expediente_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_item.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_deleted');
  END IF;

  v_org := public.current_organization_id();
  IF v_item.organization_id IS DISTINCT FROM v_org THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_org');
  END IF;

  SELECT asesor_id INTO v_lead_asesor FROM public.leads WHERE id = v_item.lead_id;

  IF NOT (public.is_admin_or_above() OR v_item.asesor_id = v_caller OR v_lead_asesor = v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.expediente_items
     SET deleted_at     = now(),
         deleted_by     = v_caller,
         deleted_reason = NULLIF(trim(p_reason), '')
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true, 'item_id', p_item_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.soft_delete_expediente_item(uuid, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.soft_delete_expediente_item(uuid, text) TO authenticated;

-- 7) RPC: restore_expediente_item (admin)
CREATE OR REPLACE FUNCTION public.restore_expediente_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_item   public.expediente_items%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF NOT public.is_admin_or_above() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_item FROM public.expediente_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_item.organization_id IS DISTINCT FROM public.current_organization_id() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_org');
  END IF;
  IF v_item.deleted_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_deleted');
  END IF;

  UPDATE public.expediente_items
     SET deleted_at     = NULL,
         deleted_by     = NULL,
         deleted_reason = NULL
   WHERE id = p_item_id;

  RETURN jsonb_build_object('ok', true, 'item_id', p_item_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.restore_expediente_item(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.restore_expediente_item(uuid) TO authenticated;

-- 8) RPC: list_deleted_expediente_items (admin)
CREATE OR REPLACE FUNCTION public.list_deleted_expediente_items(p_lead_id uuid DEFAULT NULL)
RETURNS TABLE (
  id              uuid,
  lead_id         uuid,
  asesor_id       uuid,
  tipo            text,
  titulo          text,
  descripcion     text,
  metadata        jsonb,
  created_at      timestamptz,
  deleted_at      timestamptz,
  deleted_by      uuid,
  deleted_by_name text,
  deleted_reason  text
)
LANGUAGE sql SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT e.id, e.lead_id, e.asesor_id, e.tipo, e.titulo, e.descripcion, e.metadata,
         e.created_at, e.deleted_at, e.deleted_by, p.name AS deleted_by_name, e.deleted_reason
  FROM public.expediente_items e
  LEFT JOIN public.profiles p ON p.id = e.deleted_by
  WHERE e.organization_id = public.current_organization_id()
    AND e.deleted_at IS NOT NULL
    AND public.is_admin_or_above()
    AND (p_lead_id IS NULL OR e.lead_id = p_lead_id)
  ORDER BY e.deleted_at DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.list_deleted_expediente_items(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.list_deleted_expediente_items(uuid) TO authenticated;
