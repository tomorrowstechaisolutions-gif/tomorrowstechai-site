-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — a sortable priority.
--
-- `priority` is stored as words, and words sort alphabetically: critical,
-- high, low, medium. That puts Low above Medium, which is wrong on every
-- screen that offers "sort by priority".
--
-- PostgREST can only order by a column, not by an expression, so the ordering
-- has to exist as one. A stored generated column costs four bytes a row and
-- makes the sort a real index scan instead of something the browser fixes up
-- after the fact — which would have been worse than wrong, because a page of
-- twenty-five re-sorted in JavaScript is not the same as the first
-- twenty-five by priority.
--
-- Additive: one generated column and one index. Nothing else changes.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tasks
  add column if not exists priority_rank integer
    generated always as (
      case priority
        when 'critical' then 0
        when 'high'     then 1
        when 'medium'   then 2
        when 'low'      then 3
        else 4
      end
    ) stored;

create index if not exists tasks_priority_rank_idx
  on public.tasks (priority_rank, due_at) where is_template = false;
