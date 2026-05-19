# Notas del CRM — botones de eliminar y recuperar

**Backend: 100% live en producción.** Estos snippets son para que el dev del front pegue en el componente del Cronograma de Notas. Asumen cliente `supabase-js` v2.

## 1) Botón "Eliminar" en cada nota del cronograma

Reemplaza el `.delete()` actual por la RPC. La nota se oculta del asesor y queda en la papelera para que admin pueda restaurarla.

```ts
async function eliminarNota(itemId: string, motivo?: string) {
  const { data, error } = await supabase.rpc('soft_delete_expediente_item', {
    p_item_id: itemId,
    p_reason: motivo ?? null,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'no se pudo eliminar');
  return data;
}
```

UI sugerida: botón 🗑️ → modal de confirmación con un input opcional "motivo" → llamada arriba → refetch del cronograma.

## 2) Filtrar el cronograma para asesores

Asegúrate de que la query del Cronograma filtre por `deleted_at IS NULL`. RLS ya lo hace para asesores, pero hacerlo explícito en el cliente mejora performance.

```ts
const { data } = await supabase
  .from('expediente_items')
  .select('*')
  .eq('lead_id', leadId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false });
```

## 3) Vista de papelera (admin) — botón "Recuperar"

Sólo visible para roles admin/super_admin/ceo/director. Lista las notas eliminadas y permite restaurarlas.

```ts
async function listarPapelera(leadId?: string) {
  const { data, error } = await supabase.rpc('list_deleted_expediente_items', {
    p_lead_id: leadId ?? null,
  });
  if (error) throw error;
  return data as Array<{
    id: string;
    lead_id: string;
    titulo: string;
    descripcion: string | null;
    created_at: string;
    deleted_at: string;
    deleted_by: string | null;
    deleted_by_name: string | null;
    deleted_reason: string | null;
  }>;
}

async function recuperarNota(itemId: string) {
  const { data, error } = await supabase.rpc('restore_expediente_item', {
    p_item_id: itemId,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? 'no se pudo recuperar');
  return data;
}
```

## 4) Permisos efectivos

| Acción                            | Asesor del lead | Autor de la nota | Admin / super_admin / ceo / director |
|-----------------------------------|:---------------:|:----------------:|:------------------------------------:|
| Ver notas activas del lead        | ✅              | ✅               | ✅                                   |
| Ver notas eliminadas (papelera)   | ❌              | ❌               | ✅                                   |
| Editar (titulo / descripcion)     | ✅              | ✅               | ✅                                   |
| Eliminar (soft-delete)            | ✅              | ✅               | ✅                                   |
| Restaurar                         | ❌              | ❌               | ✅                                   |
| Borrado físico                    | ❌ (bloqueado)  | ❌ (bloqueado)   | ❌ (bloqueado)                       |

## 5) Auditoría

Cada eliminación / restauración / edición queda en `public.audit_log` con:
- `actor_id`, `actor_name`, `actor_role` (quién)
- `entity_type='expediente_items'`, `entity_id` (qué)
- `action`: `INSERT | UPDATE | SOFT_DELETE | RESTORE`
- `changed_fields`: jsonb `{ campo: { old, new }, ... }`
- `created_at` (cuándo)

Recuperación total — no hay pérdida posible.
