import type { MockUser } from "@/data/mockUser";

type UserProfileCardProps = {
  user: MockUser;
  photoUrl: string | null;
};

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-sm font-medium text-zinc-100">{value}</span>
    </div>
  );
}

export function UserProfileCard({ user, photoUrl }: UserProfileCardProps) {
  return (
    <article className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/80 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-md">
      <div className="relative h-28 bg-linear-to-br from-indigo-600/90 via-violet-600/70 to-fuchsia-600/60">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]" />
        <div className="absolute -bottom-12 left-8 flex items-end gap-4">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-4 border-zinc-900 bg-zinc-800 shadow-lg ring-2 ring-white/10">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed CloudFront URLs are not stable for next/image optimization
              <img
                src={photoUrl}
                alt={`${user.displayName}の顔写真`}
                className="h-full w-full object-cover"
                width={112}
                height={112}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-zinc-800 px-2 text-center">
                <span className="text-2xl opacity-60" aria-hidden>
                  ◎
                </span>
                <span className="text-[10px] leading-tight text-zinc-400">
                  署名URL未設定
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-6 px-8 pb-8 pt-16">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {user.displayName}
            </h1>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/30">
              CloudFront 署名URL
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            顔写真はプライベート S3 を OAC 経由の CloudFront からのみ配信し、短期の署名付き
            URL で参照します。
          </p>
        </header>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="ユーザーID" value={user.id} />
          <Field label="メール" value={user.email} />
          <Field label="部署" value={user.department} />
          <Field label="役割" value={user.role} />
        </dl>

        <footer className="rounded-2xl border border-white/5 bg-zinc-950/60 px-4 py-3">
          <p className="text-xs leading-relaxed text-zinc-500">
            オブジェクトキー:{" "}
            <code className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
              {user.photoObjectKey}
            </code>
          </p>
        </footer>
      </div>
    </article>
  );
}
