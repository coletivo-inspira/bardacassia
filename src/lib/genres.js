import { cleanArtist, normalizeText } from "./catalog.js";

/** Curated: the karaoke catalog has no genre field, so styles map to catalog artist names. */
export const GENRES = [
  {
    id: "pop",
    label: "Pop",
    color: "#e1118c",
    artists: ["Anitta", "Ivete Sangalo", "Lady Gaga", "Madonna", "Katy Perry", "Britney Spears", "Taylor Swift", "Dua Lipa", "Bruno Mars", "Rihanna", "Beyonce", "Ed Sheeran", "Michael Jackson", "Iza", "Ludmilla", "Pabllo Vittar", "Gloria Groove", "Jão", "Manu Gavassi", "Sandy e Júnior", "Wanessa Camargo", "Melim", "Vitor Kley", "Maroon 5", "Miley Cyrus", "Harry Styles", "Olivia Rodrigo", "Billie Eilish", "Shakira", "One Direction", "Backstreet Boys", "Spice Girls", "Christina Aguilera", "Demi Lovato", "Justin Bieber", "Weeknd (The)"],
  },
  {
    id: "sertanejo",
    label: "Sertanejo",
    color: "#ba5d07",
    artists: ["Marília Mendonça", "Bruno e Marrone", "Jorge e Mateus", "Henrique e Juliano", "Gusttavo Lima", "Luan Santana", "Zé Neto e Cristiano", "Maiara e Maraísa", "Simone e Simaria", "Chitãozinho e Xororó", "Zezé Di Camargo e Luci", "Leonardo", "Leandro e Leonardo", "Daniel", "Paula Fernandes", "Matheus e Kauan", "Michel Teló", "Víctor e Léo", "Fernando e Sorocaba", "Eduardo Costa", "João Bosco e Vinícius", "Cristiano Araújo", "Gustavo Mioto", "Marcos e Belutti", "Israel e Rodolffo", "Lauana Prado", "Ana Castela", "Munhoz e Mariano", "Thaeme e Thiago", "Rionegro e Solimões", "Rick e Renner", "Gian e Giovani", "César Menotti e Fabiano", "Felipe Araújo", "Lucas Lucco", "Milionário e José Rico", "Sérgio Reis", "Roberta Miranda"],
  },
  {
    id: "mpb",
    label: "MPB",
    color: "#148a08",
    artists: ["Marisa Monte", "Elis Regina", "Caetano Veloso", "Djavan", "Gal Costa", "Maria Bethânia", "Chico Buarque", "Gilberto Gil", "Tim Maia", "Ana Carolina", "Milton Nascimento", "Ivan Lins", "Maria Rita", "Vanessa da Mata", "Adriana Calcanhoto", "Cássia Eller", "Zé Ramalho", "Fagner", "Ney Matogrosso", "Jorge Vercilo", "Seu Jorge", "Lenine", "Maria Gadú", "Tribalistas", "Zeca Baleiro", "Belchior", "Gonzaguinha", "Simone", "Jorge Benjor", "Elba Ramalho", "Zélia Duncan", "Anavitória", "Roberta Sá"],
  },
  {
    id: "rock-nacional",
    label: "Rock nacional",
    color: "#e91429",
    artists: ["Legião Urbana", "Raul Seixas", "Skank", "Capital Inicial", "Titãs", "Paralamas do Sucesso", "Engenheiros do Hawaii", "Barão Vermelho", "Kid Abelha", "Rita Lee", "Lulu Santos", "Jota Quest", "Charlie Brown Jr.", "IRA!", "Biquini Cavadão", "Cazuza", "CPM 22", "Detonautas", "NX Zero", "Pitty", "O Rappa", "Ultraje a Rigor", "Mamonas Assassinas", "Nando Reis", "Frejat", "Lobão", "RPM", "Los Hermanos", "Raimundos", "Nenhum de Nós", "Cidade Negra", "Pato Fú", "Blitz"],
  },
  {
    id: "rock-internacional",
    label: "Rock internacional",
    color: "#1e3264",
    artists: ["Queen", "Beatles (The)", "Bon Jovi", "Coldplay", "U2", "Aerosmith", "Elvis Presley", "Rolling Stones", "Guns n' Roses", "Red Hot Chili Peppers", "Pearl Jam", "Nirvana", "Linkin Park", "Metallica", "Green Day", "Foo Fighters", "Avril Lavigne", "Roxette", "Ramones", "INXS", "C.C.R.", "Supertramp", "A-Ha", "Alanis Morissette"],
  },
  {
    id: "pagode-samba",
    label: "Pagode e samba",
    color: "#8d67ab",
    artists: ["Zeca Pagodinho", "Só Pra Contrariar", "Exaltasamba", "Raça Negra", "Sorriso Maroto", "Belo", "Thiaguinho", "Ferrugem", "Grupo Revelação", "Alcione", "Martinho da Vila", "Art Popular", "Katinguelê", "Negritude Júnior", "Pixote", "Péricles", "Dilsinho", "Turma do Pagode", "Jorge Aragão", "Beth Carvalho", "Clara Nunes", "Fundo de Quintal", "Harmonia do Samba", "Mumuzinho", "Molejo", "Os Travessos", "Diogo Nogueira", "Alexandre Pires", "Soweto", "Menos e Mais"],
  },
  {
    id: "funk",
    label: "Funk",
    color: "#dc148c",
    artists: ["Anitta", "Ludmilla", "MC Kevinho", "MC Gui", "Kelly Key", "Bonde do Tigrão", "Latino", "Pedro Sampaio", "Gloria Groove", "Pabllo Vittar", "Zé Felipe"],
  },
  {
    id: "forro-axe",
    label: "Forró, piseiro e axé",
    color: "#477d95",
    artists: ["Os Baroes da Pisadinha", "Wesley Safadão", "Aviões do Forró", "Calcinha Preta", "Banda Calypso", "Mastruz Com Leite", "Falamansa", "Luiz Gonzaga", "Elba Ramalho", "Alceu Valença", "Ivete Sangalo", "Daniela Mercury", "Claudia Leitte", "Banda Eva", "Babado Novo", "Chiclete com Banana", "Asa de Águia", "Netinho", "Banda Cheiro de Amor", "Araketu", "Jammil e Uma Noites", "É o Tchan", "Leo Santana", "Companhia do Calypso"],
  },
  {
    id: "romanticas",
    label: "Românticas",
    color: "#b4495e",
    artists: ["Roberto Carlos", "Fábio Jr.", "Roupa Nova", "Amado Batista", "Wando", "Reginaldo Rossi", "Nelson Gonçalves", "Altemar Dutra", "Agnaldo Timóteo", "José Augusto", "Guilherme Arantes", "Fafá de Belém", "Joanna", "Benito Di Paula", "Adele", "Whitney Houston", "Celine Dion", "Mariah Carey", "Elton John", "Bee Gees", "Lionel Richie", "Air Supply", "Michael Buble", "Carpenters", "Simply Red", "James Blunt"],
  },
  {
    id: "anos-80-90",
    label: "Anos 80 e 90",
    color: "#509bf5",
    artists: ["Abba", "Madonna", "Michael Jackson", "Roxette", "A-Ha", "Bon Jovi", "Cyndi Lauper", "George Michael", "Tina Turner", "Whitney Houston", "Backstreet Boys", "Spice Girls", "Kid Abelha", "Blitz", "RPM", "Ritchie", "Léo Jaime", "Marina Lima", "KLB", "Rouge", "Xuxa", "Sandy e Júnior", "Mamonas Assassinas", "Biafra (Byafra)", "Deborah Blando"],
  },
  {
    id: "gospel",
    label: "Gospel",
    color: "#2d8a6a",
    artists: ["Aline Barros", "Diante do Trono", "Fernandinho", "Renascer Praise", "Cassiane", "Cristina Mel", "Fernanda Brum", "Kadoshi", "Toque no Altar", "Resgate", "Oficina G3", "Kleber Lucas", "Bruna Karla", "Anderson Freire", "Thalles Roberto", "Harpa Cristã", "Pe. Fábio de Mello", "Padre Zezinho"],
  },
];

export function genreById(id) {
  return GENRES.find((genre) => genre.id === id) || null;
}

/** Artists of the chosen styles, in style order, keeping only names present in the catalog. */
export function artistsForGenres(genreIds, catalogArtistList) {
  const byKey = new Map(catalogArtistList.map((artist) => [artist.key, artist]));
  const result = new Map();
  for (const id of genreIds) {
    for (const name of genreById(id)?.artists || []) {
      const key = normalizeText(name);
      const artist = byKey.get(key);
      if (artist && !result.has(key)) result.set(key, { ...artist, genre: id });
    }
  }
  return [...result.values()];
}

/** First chosen style whose curated list covers this song's artist. */
export function genreForSong(song, genreIds) {
  const key = normalizeText(cleanArtist(song.artist));
  for (const id of genreIds) {
    const genre = genreById(id);
    if (genre?.artists.some((name) => normalizeText(name) === key)) return genre;
  }
  return null;
}
