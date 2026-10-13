import { Suspense } from "react";

import { CreateCollector, UsersTable } from "@/components/ops/users-table";
import { OpsPage, selectClass } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { UserRow } from "@/lib/admin-types";
import { get } from "@/lib/api";
import type { Me } from "@/lib/me";

type Filters = { q?: string; role?: string };

export default function UsersPage({ searchParams }: PageProps<"/ops-portal/users">) {
  return (
    <OpsPage
      title="Users and collectors"
      filters={
        <Suspense>
          <FilterForm searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
        <Users searchParams={searchParams} />
      </Suspense>
    </OpsPage>
  );
}

async function filtersOf(searchParams: PageProps<"/ops-portal/users">["searchParams"]): Promise<Filters> {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  return { q: one(params.q), role: one(params.role) };
}

async function FilterForm({ searchParams }: { searchParams: PageProps<"/ops-portal/users">["searchParams"] }) {
  const f = await filtersOf(searchParams);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form className="flex flex-wrap items-end gap-2" action="/ops-portal/users">
        <input name="q" defaultValue={f.q ?? ""} placeholder="Name, email or phone" aria-label="Search" className={`${selectClass} w-56`} />
        <select name="role" defaultValue={f.role ?? ""} aria-label="Role" className={selectClass}>
          <option value="">Everyone</option>
          <option value="USER">Customers</option>
          <option value="COLLECTOR">Collectors</option>
          <option value="ADMIN">Admins</option>
        </select>
        <button type="submit" className="d-btn d-btn-outline d-btn-sm">
          Search
        </button>
      </form>
      <CreateCollector />
    </div>
  );
}

async function Users({ searchParams }: { searchParams: PageProps<"/ops-portal/users">["searchParams"] }) {
  const f = await filtersOf(searchParams);
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const [rows, me] = await Promise.all([get<UserRow[]>(`/admin/users${query ? `?${query}` : ""}`), get<Me>("/me")]);
  return <UsersTable rows={rows} meId={me.id} />;
}
