/**
 * Monta a capa da colecao de promos.
 *
 * As outras 26 colecoes tem capa porque tem pacote: a arte da embalagem existe,
 * e a crianca reconhece de longe o pacote que viu na loja. Promo nao vem em
 * pacote — e a carta que veio dentro da caixa, do livro, do evento. Nao ha
 * embalagem para fotografar, e nenhuma das duas APIs publica arte de pacote
 * (spec de assets §7 ja registrava isso).
 *
 * Entao a capa e feita da propria carta mais reconhecivel da colecao: a arte
 * ampliada e desfocada como fundo, a carta inteira e nitida no centro, e o nome
 * embaixo. Fica um cartaz, nao um pacote — que e exatamente a verdade sobre o
 * que essa colecao e.
 *
 * Idempotente por omissao: sobrescreve sempre, mas so e chamado a mao.
 *
 *   node tools/capa-promos.mjs [--set mep] [--carta mep-29]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i === -1 ? padrao : args[i + 1];
};

const SET_ID = opcao("--set", "mep");
const CARTA = opcao("--carta", null);

// 780x1426 e a proporcao das capas de pacote (0,547) — a tela inicial recorta
// tudo em aspect 366/670, entao sair fora daqui e perder arte no corte.
const L = 780;
const A = 1426;

const raiz = path.join(process.cwd(), "assets", SET_ID);
const manifest = JSON.parse(readFileSync(path.join(raiz, "manifest.json"), "utf8"));

/** A carta da capa: a escolhida, ou a primeira que o manifest oferecer. */
const carta = CARTA
  ? manifest.cards.find((c) => c.id === CARTA)
  : manifest.cards[0];
if (!carta) {
  console.error(`Carta ${CARTA ?? "(primeira)"} nao esta no manifest de ${SET_ID}.`);
  console.error(`Disponiveis: ${manifest.cards.map((c) => c.id).join(", ")}`);
  process.exit(2);
}

const origem = path.join(process.cwd(), "assets", carta.imagePath);
if (!existsSync(origem)) {
  console.error(`Imagem nao esta em disco: ${carta.imagePath}`);
  process.exit(2);
}

const arte = readFileSync(origem);

// Fundo: a mesma arte preenchendo a capa, desfocada e escurecida. Desfocar
// resolve o corte (0,716 da carta contra 0,547 da capa) sem mostrar recorte.
const fundo = await sharp(arte)
  .resize(L, A, { fit: "cover", position: "top" })
  .blur(28)
  .modulate({ brightness: 0.42, saturation: 1.15 })
  .toBuffer();

// A carta nitida, centralizada na metade de cima, com folga para o texto.
const larguraCarta = Math.round(L * 0.72);
const cartaNitida = await sharp(arte)
  .resize({ width: larguraCarta })
  .toBuffer();
const { height: alturaCarta } = await sharp(cartaNitida).metadata();
const topoCarta = Math.round(A * 0.105);

const sombra = Buffer.from(
  `<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
     <defs>
       <radialGradient id="brilho" cx="50%" cy="34%" r="62%">
         <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
         <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
       </radialGradient>
       <linearGradient id="pe" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
         <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
       </linearGradient>
     </defs>
     <rect width="${L}" height="${A}" fill="url(#brilho)"/>
     <rect y="${Math.round(A * 0.55)}" width="${L}" height="${Math.round(A * 0.45)}" fill="url(#pe)"/>
   </svg>`,
);

/*
 * A estrela preta e a marca das Black Star Promos — e o que esta impresso no
 * lugar do simbolo do set em toda carta desta colecao. Vale mais que qualquer
 * enfeite: quem ja viu uma promo reconhece.
 */
const texto = Buffer.from(
  `<svg width="${L}" height="${A}" xmlns="http://www.w3.org/2000/svg">
     <g transform="translate(${L / 2}, ${Math.round(A * 0.755)})">
       <path d="M 0 -44 L 12.9 -13.6 L 45.8 -11 L 20.8 10.4 L 28.5 42.5 L 0 25.4
                L -28.5 42.5 L -20.8 10.4 L -45.8 -11 L -12.9 -13.6 Z"
             fill="#000000" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>
     </g>
     <text x="${L / 2}" y="${Math.round(A * 0.858)}" text-anchor="middle"
           font-family="Helvetica, Arial, sans-serif" font-size="104" font-weight="700"
           letter-spacing="10" fill="#ffffff">PROMOS</text>
     <text x="${L / 2}" y="${Math.round(A * 0.912)}" text-anchor="middle"
           font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="500"
           letter-spacing="4" fill="#ffffff" fill-opacity="0.8">MEGA EVOLUTION</text>
   </svg>`,
);

const destino = path.join(raiz, "capa.png");
await sharp(fundo)
  .composite([
    { input: sombra },
    { input: cartaNitida, top: topoCarta, left: Math.round((L - larguraCarta) / 2) },
    { input: texto },
  ])
  .png()
  .toFile(destino);

console.log(`capa de ${SET_ID} feita com ${carta.id} "${carta.name}" -> ${destino}`);
console.log(`  (${L}x${A}, carta a ${larguraCarta}x${alturaCarta})`);
