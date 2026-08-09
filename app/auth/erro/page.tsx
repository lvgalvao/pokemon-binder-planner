import Link from "next/link";

/**
 * Link vencido, ja usado, ou aberto pela metade. Uma frase e uma saida — nao
 * ha nada que a pessoa possa consertar aqui alem de pedir outro link.
 */
export default async function ErroDeLink({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string }>;
}) {
  const { motivo } = await searchParams;

  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center px-5 text-center">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Esse link não vale mais</h1>
        <p className="text-(--color-tinta-fraca)">
          Links de e-mail valem por pouco tempo e só podem ser usados uma vez.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-full bg-(--color-tinta) px-6 font-semibold text-(--color-mesa)"
        >
          Voltar e pedir outro
        </Link>
        {motivo && (
          <p className="pt-2 text-xs text-(--color-tinta-fraca)">{motivo}</p>
        )}
      </div>
    </main>
  );
}
