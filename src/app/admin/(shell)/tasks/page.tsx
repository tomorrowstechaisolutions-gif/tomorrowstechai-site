import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getAdminUser } from "@/lib/supabase/server";
import {
  isTaskGroup, isTaskSort, isTaskTab,
  type TaskGroup, type TaskSort, type TaskTab,
} from "@/lib/tasks/config";
import {
  loadTaskDetail, loadTaskLinkOptions, loadTaskWorkspace,
} from "@/lib/tasks/queries";
import { createTaskAction } from "@/app/admin/task-actions";
import TasksBoard from "@/components/admin/cc/panels/TasksBoard";
import TaskDrawer from "@/components/admin/cc/tasks/TaskDrawer";
import NewTaskModal from "@/components/admin/cc/tasks/NewTaskModal";
import { IconAlert } from "@/components/admin/cc/Icons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tasks" };

/**
 * Everything that needs to get done across the business.
 *
 * The list, its filters and its page are all read from the URL and resolved
 * in Postgres. The detail drawer is opened by a `?task=` parameter rather
 * than a route change, so the list underneath keeps its scroll position and
 * the back button closes the drawer.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminUser();
  if (!session) redirect("/admin/login");

  const params = await searchParams;
  const one = (key: string): string | undefined => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };

  const tab: TaskTab = isTaskTab(one("tab")) ? (one("tab") as TaskTab) : "mine";
  const sort: TaskSort = isTaskSort(one("sort")) ? (one("sort") as TaskSort) : "due";
  const group: TaskGroup = isTaskGroup(one("group")) ? (one("group") as TaskGroup) : "none";
  const view = one("view") === "board" ? "board" : "table";
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);
  const openTaskId = one("task");

  const supabase = await createSupabaseServerClient();
  const viewer = session.admin.email;

  let board;
  try {
    board = await loadTaskWorkspace(
      supabase,
      {
        tab, sort, group, page,
        q: one("q"),
        status: one("status"),
        type: one("type"),
        priority: one("priority"),
        owner: one("owner"),
        client: one("client"),
        project: one("project"),
      },
      viewer
    );
  } catch (err) {
    return (
      <div className="cc-error">
        <IconAlert size={15} />
        <span>{err instanceof Error ? err.message : "Tasks could not be loaded."}</span>
      </div>
    );
  }

  const [options, detail] = await Promise.all([
    loadTaskLinkOptions(supabase),
    openTaskId ? loadTaskDetail(supabase, openTaskId) : Promise.resolve(null),
  ]);

  // The list's own URL, without the drawer — what closing it returns to.
  const listParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "task" || typeof value !== "string" || !value) continue;
    listParams.set(key, value);
  }
  const query = listParams.toString();
  const closeHref = `/admin/tasks${query ? `?${query}` : ""}`;

  // Assignees the pickers can offer: whoever already owns something, plus
  // whoever is signed in, so a first task can be assigned to somebody.
  const owners = Array.from(new Set([...board.owners, viewer])).sort();

  return (
    <>
      <div className="cc-greet">
        <div>
          <h1>Tasks</h1>
          <p>Everything that needs to get done across your business.</p>
        </div>
        <NewTaskModal
          action={createTaskAction}
          owner={viewer}
          owners={owners}
          options={options}
        />
      </div>

      <TasksBoard board={board} tab={tab} view={view} group={group} query={query} />

      {detail ? (
        <TaskDrawer
          detail={detail}
          closeHref={closeHref}
          options={options}
          owners={owners}
        />
      ) : null}
    </>
  );
}
