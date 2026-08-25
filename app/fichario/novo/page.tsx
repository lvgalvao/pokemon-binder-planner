import { listSets } from "@/lib/manifests";
import { MAX_COLECOES_NO_FICHARIO, MIN_COLECOES_NO_FICHARIO } from "@/lib/db";
import MontarFichario from "@/components/MontarFichario";

/**
 * Tela de montagem. Estatica de proposito: nao depende de sessao nem de estado —
 * quem chega aqui ainda nao tem fichario nenhum, e as capas sao as mesmas para
 * todo mundo. A conta so nasce no POST que monta.
 */
export default function NovoFicharioPage() {
  return (
    <MontarFichario
      sets={listSets()}
      minimo={MIN_COLECOES_NO_FICHARIO}
      maximo={MAX_COLECOES_NO_FICHARIO}
    />
  );
}
