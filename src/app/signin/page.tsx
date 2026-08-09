import { RolePicker } from '@/components/shell/role-picker'
import { ROLES, ROLE_LABELS, ROLE_SCOPE_HINT } from '@/lib/policy'
import { DEMO_USERS } from '@/lib/session'

export default function SignIn() {
  const roles = ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    hint: ROLE_SCOPE_HINT[role],
    name: DEMO_USERS[role].name,
    hue: DEMO_USERS[role].avatarHue,
  }))

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <div className="mb-10">
        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-brand">
          Claims Adjudication
        </p>
        <h1 className="mb-3 text-[34px] font-semibold leading-tight tracking-[-0.02em]">
          Choose a role to sign in
        </h1>
        <p className="max-w-2xl text-[15px] leading-relaxed text-nav">
          Each role gets a different slice of the 20,000-claim queue and a different set of
          actions. The row filter and every action check run on the server — switching roles
          here changes what the backend will allow, not just what the interface shows.
        </p>
      </div>

      <RolePicker roles={roles} />
    </main>
  )
}
