import { redirect } from 'next/navigation';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/authz/policy';
import { prisma } from '@/server/db/client';
import { SEVERITY_LABEL } from '@/lib/labels';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives';

export const metadata = { title: 'Portals & routing' };
export const dynamic = 'force-dynamic';

/**
 * Configuration view: portals, their categories and the routing rules that decide which
 * project and teams a ticket lands in — all database-driven, changeable without a deployment.
 */
export default async function PortalsPage() {
  const admin = await requireUser();
  if (!hasPermission(admin, 'config.portal.manage')) redirect('/dashboard');

  const [portals, rules, slas] = await Promise.all([
    prisma.portal.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        categories: { orderBy: { sortOrder: 'asc' } },
        projects: { include: { teams: true } },
      },
    }),
    prisma.routingRule.findMany({
      where: { isActive: true },
      include: {
        portal: { select: { name: true } },
        category: { select: { name: true } },
        project: { select: { name: true } },
        supportTeam: { select: { name: true } },
        qaTeam: { select: { name: true } },
      },
    }),
    prisma.slaPolicy.findMany({ where: { isActive: true }, orderBy: { severity: 'asc' } }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow="Configuration"
        title="Portals, routing and SLA"
        description="Business configuration. Changes here take effect immediately — no code deployment."
      />

      <div className="mt-6 space-y-4">
        {portals.map((portal) => (
          <Card key={portal.id}>
            <CardHeader
              title={portal.name}
              description={portal.description ?? undefined}
              action={
                <Badge
                  tone={
                    portal.isActive
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                      : undefined
                  }
                >
                  {portal.isActive ? 'Active' : 'Inactive'}
                </Badge>
              }
            />
            <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
                  Categories
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {portal.categories.map((category) => (
                    <Badge key={category.id}>{category.name}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
                  Projects and teams
                </h3>
                <ul className="space-y-1 text-ink-600">
                  {portal.projects.map((project) => (
                    <li key={project.id}>
                      <span className="font-medium text-ink-800">{project.name}</span>
                      <span className="ml-1.5 font-mono text-xs text-ink-500">
                        {project.keyPrefix ?? 'SUP'}
                      </span>
                      <span className="block text-xs text-ink-500">
                        {project.teams.map((team) => team.name).join(' · ') || 'No teams'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        ))}

        <Card>
          <CardHeader title="Routing rules" description="The most specific matching rule wins." />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Rule
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Portal
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Project
                  </th>
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    Teams
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td className="px-5 py-2.5 font-medium text-ink-900">{rule.name}</td>
                    <td className="px-3 py-2.5 text-ink-600">{rule.portal?.name ?? 'Any'}</td>
                    <td className="px-3 py-2.5 text-ink-600">{rule.category?.name ?? 'Any'}</td>
                    <td className="px-3 py-2.5 text-ink-600">{rule.project?.name ?? '—'}</td>
                    <td className="px-5 py-2.5 text-xs text-ink-500">
                      {[rule.supportTeam?.name, rule.qaTeam?.name].filter(Boolean).join(' · ') ||
                        '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="SLA policies"
            description="First response and resolution targets by severity."
          />
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-200 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Severity
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  First response
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Resolution
                </th>
                <th scope="col" className="px-5 py-2.5 font-medium">
                  Clock
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {slas.map((policy) => (
                <tr key={policy.id}>
                  <td className="px-5 py-2.5 font-medium text-ink-900">
                    {SEVERITY_LABEL[policy.severity]}
                  </td>
                  <td className="px-3 py-2.5 text-ink-600">{policy.firstResponseMins} min</td>
                  <td className="px-3 py-2.5 text-ink-600">
                    {Math.round(policy.resolutionMins / 60)} h
                  </td>
                  <td className="px-5 py-2.5 text-xs text-ink-500">
                    {policy.businessHoursOnly ? 'Business hours' : '24/7'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
