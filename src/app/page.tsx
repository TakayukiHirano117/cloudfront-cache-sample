import { UserProfileCard } from "@/components/UserProfileCard";
import { mockUser } from "@/data/mockUser";
import { signFacePhotoUrl } from "@/lib/signFacePhotoUrl";

export default function Home() {
  const photoUrl = signFacePhotoUrl(mockUser.photoObjectKey);

  return (
    <div className="relative min-h-full overflow-hidden bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(120,119,198,0.35),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(217,70,239,0.12),transparent_40%)]" />

      <main className="relative mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/90">
            Sample
          </p>
          <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            ユーザー詳細（顔写真は署名 URL）
          </h2>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-zinc-400">
            DB は使わず固定モック。サーバー側で CloudFront 署名 URL を生成し、ブラウザは
            メディア用ドメインにのみリクエストします。
          </p>
        </div>

        <UserProfileCard user={mockUser} photoUrl={photoUrl} />
      </main>
    </div>
  );
}
