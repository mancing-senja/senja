/** How each district talks.
 *
 *  The generative dialogue engine decides *what* a villager brings up —
 *  the weather, the hour, a memory, the place you are standing in. This
 *  file decides how they say it, and the difference is the whole reason
 *  four genres in one world does not just mean four sets of scenery.
 *
 *  A keep guard and a quay technician can both be prompted by "it is
 *  raining". One says the moat is rising; the other says the drainage is
 *  backed up again. Same engine, same topic weights, different mouth.
 *
 *  Every pool here is drawn from a shuffled bag, so within a register you
 *  will hear every line once before you hear any of them twice. */

export type Register = 'cozy' | 'medieval' | 'cyber' | 'fantasy';

export interface TopicPools {
  rain: string[];
  dry: string[];
  pagi: string[];
  siang: string[];
  senja: string[];
  malam: string[];
  fishRecent: string[];
  fishGeneral: string[];
  money: string[];
  story: string[];
  joke: string[];
  peopleMany: string[];
  peopleFew: string[];
  self: string[];
  /** Greeting for a total stranger, per register. */
  meet: string[];
  /** Openers when you have been away for days, and when it is a new day.
   *  These used to be shared, which had a keep guard asking whether you had
   *  eaten breakfast. */
  gap: string[];
  newday: string[];
  again: string[];
  closeWarm: string[];
  closeCold: string[];
  closeFlat: string[];
  /** Callbacks to things that actually happened. `{s}` is the subject
   *  (a species, a place), `{v}` a number. Voiced per register for the same
   *  reason the openers are: a grove hermit does not say "nyariin kamu". */
  memRecord: string[];
  memRare: string[];
  memAbsence: string[];
}

/** `{p}` is replaced with the player's name, `{f}` with the last fish. */
export const REGISTERS: Record<Register, TopicPools> = {
  // -------------------------------------------------------------- cozy
  cozy: {
    rain: [
      'Hujan begini ikannya malah berani naik.',
      'Bawa payung ga? Ya sudah, basah sedikit ga apa-apa.',
      'Air keruh, umpan harus lebih bau.',
      'Tanaman senang, saya yang kedinginan.',
      'Kalau hujan, petak-petak itu ga usah disiram.',
    ],
    dry: [
      'Anginnya enak hari ini.',
      'Langitnya bersih. Malam nanti pasti banyak bintang.',
      'Panas begini ikan pada ngumpet di bawah eceng.',
      'Sudah lama ga hujan. Sumur mulai turun.',
      'Adem. Cocok buat duduk lama-lama.',
    ],
    pagi: [
      'Pagi itu jamnya wader dan seluang.',
      'Masih pagi, airnya belum ramai.',
      'Kalau mau tenang, ya jam segini.',
      'Embunnya belum kering.',
    ],
    siang: [
      'Siang begini ikan males makan.',
      'Panas. Duduk di bawah pohon saja.',
      'Kalau siang, saya biasanya di rumah.',
      'Cari yang teduh, jangan di tengah.',
    ],
    senja: [
      'Nah, ini jamnya. Senja itu paling bagus.',
      'Lihat langitnya. Tiap hari beda warnanya.',
      'Sebentar lagi lampu-lampu nyala.',
      'Jam segini airnya paling hidup.',
    ],
    malam: [
      'Malam-malam masih di luar?',
      'Yang naik malam itu lele sama gabus.',
      'Hati-hati, jalannya gelap.',
      'Kunang-kunang lagi banyak.',
    ],
    fishRecent: [
      '{f} ya? Lumayan.',
      'Saya dengar kamu dapat {f}.',
      '{f} itu enaknya dibakar.',
      'Yang tadi itu ukurannya wajar. Ada yang lebih besar di dalam.',
    ],
    fishGeneral: [
      'Umpan itu ga usah mahal. Yang penting sabar.',
      'Kalau kail sering kosong, coba lempar lebih jauh.',
      'Tiap tempat beda ikannya. Jangan di situ-situ saja.',
      'Ikan besar itu nunggu di air dalam.',
    ],
    money: [
      'Jual ikannya sebelum bau, harganya turun.',
      'Bibit labu mahal, tapi baliknya paling banyak.',
      'Saya lagi nabung. Jangan tanya buat apa.',
      'Semua ada harganya di sini, kecuali pemandangan.',
    ],
    story: [
      'Kata orang tua dulu, ada ikan yang cuma muncul kalau air diam total.',
      'Jangan mancing di rawa pas bulan ga kelihatan.',
      'Ada yang bilang lubuk di tengah itu ga ada dasarnya.',
      'Kalau kailmu ditarik tapi ga ada apa-apa, sudah, pindah tempat.',
    ],
    joke: [
      'Ikan ga pernah telat. Yang telat itu kita.',
      'Saya mancing dua puluh tahun. Yang saya dapat cuma sakit pinggang.',
      'Kalau ga dapat ikan, bilang saja lagi latihan sabar.',
      'Kemarin saya dapat sepatu. Sebelah. Masih saya simpan.',
    ],
    peopleMany: [
      'Ramai ya hari ini.',
      'Teman kamu yang di dermaga itu betah banget berdirinya.',
      'Bagus kalau rame. Danau ini kalau sepi jadi seram.',
    ],
    peopleFew: [
      'Sepi hari ini. Cuma kita.',
      'Orang-orang pada di rumah kayaknya.',
      'Enak juga sih sepi. Ga ada yang rebutan tempat.',
    ],
    self: [
      'Saya sebenarnya ga terlalu suka ikan. Sukanya duduknya.',
      'Rumah saya yang atapnya paling miring itu.',
      'Kaki saya sudah ga kuat jalan jauh-jauh.',
      'Saya di sini sejak kecil. Ga pernah ke mana-mana.',
    ],
    meet: [
      'Oh, orang baru. Salam kenal.',
      'Belum pernah lihat kamu di sini.',
      'Halo! Kamu yang tinggal di pondok itu ya?',
    ],
    gap: [
      'Lama ga keliatan, {p}.',
      'Kemana aja?',
      'Saya kira kamu sudah pindah.',
      'Kirain kamu bosan sama danau ini.',
    ],
    newday: [
      'Pagi tadi airnya kabut tebal.',
      'Eh, {p}.',
      'Hari baru, semoga rezekinya baru juga.',
      'Sudah sarapan belum?',
    ],
    again: ['Kamu lagi.', 'Balik lagi ke sini?', 'Belum capek muter-muter?'],
    memRecord: [
      'Masih ingat {s} {v} senti itu? Belum ada yang lewat.',
      'Sampai sekarang rekor kamu masih {v} senti.',
    ],
    memRare: [
      'Saya masih ga percaya kamu dapat {s}.',
      'Orang-orang masih ngomongin {s} kamu itu.',
    ],
    memAbsence: [
      'Kemarin-kemarin saya nyariin kamu, ga ketemu.',
      'Jangan hilang lama-lama lagi.',
    ],
    closeWarm: ['Mampir lagi ya.', 'Semoga dapat yang besar, {p}.', 'Kalau butuh apa-apa, bilang saja.'],
    closeCold: ['Sudah, saya mau sendiri dulu.', 'Ya sudah. Hati-hati.', 'Lagi ga enak badan saya.'],
    closeFlat: ['Ya sudah.', 'Sana, keburu gelap.', 'Hati-hati di jalan.'],
  },

  // ---------------------------------------------------------- medieval
  // Formal, unhurried, and speaks of the keep as though it still has a
  // garrison. Nobody here says "oke".
  medieval: {
    rain: [
      'Hujan turun. Parit akan naik semalam suntuk.',
      'Batu benteng jadi licin kalau begini. Jangan naik tangga.',
      'Dulu, hujan seperti ini menahan pasukan berhari-hari.',
      'Air hujan masuk lewat celah tembok. Sudah puluhan tahun begitu.',
    ],
    dry: [
      'Angin dari utara. Panji di menara itu berkibar penuh.',
      'Langit bersih. Penjaga lama bilang, langit begini pertanda tenang.',
      'Rumput di halaman mulai kering. Batunya menahan panas.',
      'Hari yang lapang. Tak ada yang perlu dijaga.',
    ],
    pagi: [
      'Pagi. Dulu jam segini terompet dibunyikan dari menara.',
      'Kabut belum lepas dari parit.',
      'Fajar di balik tembok itu pemandangan yang tak pernah bosan.',
    ],
    siang: [
      'Matahari tinggi. Bayangan tembok pendek sekali.',
      'Siang begini penjaga dulu berteduh di bawah gerbang.',
      'Panas memantul dari batu. Jangan lama-lama di tengah halaman.',
    ],
    senja: [
      'Menjelang petang, obor dinyalakan satu per satu. Kebiasaan lama.',
      'Cahaya sore membuat batu ini kelihatan masih utuh.',
      'Jam segini dulu gerbang ditutup.',
    ],
    malam: [
      'Malam di benteng terasa lebih tua daripada siangnya.',
      'Kalau angin lewat celah menara, bunyinya seperti orang bicara.',
      'Bawa obor. Jangan mengandalkan bulan.',
    ],
    fishRecent: [
      '{f}. Tangkapan yang pantas.',
      'Kudengar kau menarik {f} dari parit. Tidak buruk.',
      '{f} dari air sedingin itu — patut dibanggakan.',
    ],
    fishGeneral: [
      'Ikan di parit ini lebih tua daripada kita berdua.',
      'Air di bawah tembok dalam sekali. Yang besar bersembunyi di sana.',
      'Sabar. Batu ini menunggu tiga ratus tahun; kau bisa menunggu sejam.',
    ],
    money: [
      'Emas di sini tinggal yang di panji. Sisanya sudah lama dibawa pergi.',
      'Dulu ada bendahara. Sekarang tinggal ruangannya.',
      'Kalau kau menjual tangkapan, jual di desa. Di sini tak ada pembeli.',
    ],
    story: [
      'Katanya tuan benteng ini tenggelam di paritnya sendiri. Tak ada yang tahu benar.',
      'Menara timur tidak pernah runtuh oleh perang. Runtuh sendiri, malam hari.',
      'Ada yang bilang, sesuatu di parit itu ikut menjaga tembok.',
      'Jangan bermalam di halaman. Bukan karena hantu — karena dingin.',
    ],
    joke: [
      'Aku menjaga tembok yang sudah tidak ada gerbangnya. Pekerjaan yang aman.',
      'Musuh terakhir yang datang ke sini adalah lumut.',
      'Kalau kau mencari kepahlawanan, kau salah abad.',
    ],
    peopleMany: [
      'Ramai. Sudah lama halaman ini tidak menampung sebanyak ini.',
      'Suara orang di halaman batu terdengar dua kali. Perhatikan.',
    ],
    peopleFew: [
      'Sepi. Seperti biasanya, sebenarnya.',
      'Hanya kita dan batu.',
    ],
    self: [
      'Aku lahir di bawah tembok ini. Kemungkinan besar juga mati di sini.',
      'Ayahku menjaga gerbang. Aku menjaga tempat gerbang itu dulu berdiri.',
      'Aku tidak tahu apa-apa selain benteng ini.',
    ],
    meet: [
      'Wajah baru. Namaku tak penting; benteng ini yang penting.',
      'Selamat datang di Benteng Lama. Hati-hati dengan batunya.',
      'Kau bukan dari sini. Tak apa. Sudah lama tak ada tamu.',
    ],
    gap: [
      'Sudah lama kau tak lewat, {p}.',
      'Kukira kau sudah meninggalkan tempat ini.',
      'Batu ini tak berubah. Kau yang menghilang.',
      'Beberapa hari tanpa kabar. Tak ada yang mencarimu, tenang saja.',
    ],
    newday: [
      'Hari baru. Tembok masih berdiri.',
      'Kau datang pagi-pagi, {p}.',
      'Semalam angin kencang. Ada satu batu lagi yang jatuh.',
      'Selamat datang kembali.',
    ],
    again: ['Kau lagi.', 'Belum puas berkeliling?', 'Kembali secepat itu?'],
    memRecord: [
      '{s} sepanjang {v} senti itu masih dibicarakan di halaman.',
      'Belum ada yang menandingi {v} senti milikmu.',
    ],
    memRare: [
      'Aku menyaksikan sendiri kau menarik {s}. Sulit dipercaya.',
      '{s} itu tidak muncul dua kali dalam satu generasi.',
    ],
    memAbsence: [
      'Kau menghilang cukup lama. Tembok ini tak mencatat, tapi aku mencatat.',
      'Jangan pergi selama itu lagi.',
    ],
    closeWarm: ['Semoga air berpihak padamu, {p}.', 'Kembalilah. Tempat ini butuh suara.', 'Jaga dirimu.'],
    closeCold: ['Aku ingin sendiri.', 'Cukup untuk hari ini.', 'Pergilah.'],
    closeFlat: ['Baiklah.', 'Hari mulai turun. Pergilah.', 'Selamat jalan.'],
  },

  // ------------------------------------------------------------- cyber
  // Clipped, tired, and technical. Talks about the lake as infrastructure.
  cyber: {
    rain: [
      'Hujan. Drainase blok tiga mampet lagi, tiap kali.',
      'Air hujan campur buangan pipa. Jangan sentuh, seriusan.',
      'Bagus buat papan reklame. Pantulannya jadi dobel.',
      'Basah begini kabel di fasad suka korslet. Biasa.',
    ],
    dry: [
      'Kering. Berarti pipa buangan yang bikin airnya hangat, bukan hujan.',
      'Udaranya bau ozon. Trafo lagi kerja keras.',
      'Malam ini papan reklame full nyala. Tagihan siapa yang tahu.',
      'Angin ga ada. Asapnya numpuk di atas.',
    ],
    pagi: [
      'Pagi di sini cuma artinya lampu jalan mati.',
      'Shift malam baru kelar. Jangan tanya saya jam berapa.',
      'Subuh itu satu-satunya jam blok ini diam.',
    ],
    siang: [
      'Siang? Ga ada bedanya. Papannya tetep nyala.',
      'Matahari ketutup gedung dari jam sebelas.',
      'Jam segini semua orang di dalam.',
    ],
    senja: [
      'Nah, sekarang tempat ini baru hidup.',
      'Lampu nyala satu-satu. Saya suka bagian ini.',
      'Sore itu jam paling jujur di sini. Belum ramai, udah nyala.',
    ],
    malam: [
      'Malam ya begini terus. Terang tapi ga ada matahari.',
      'Kalau kamu lihat ada yang nyala di air, itu bukan ikan.',
      'Jangan mancing dekat mulut pipa. Airnya panas.',
    ],
    fishRecent: [
      '{f}? Cek dulu sisiknya. Kadang ada yang aneh.',
      'Dapat {f}. Di sini itu bukan hal biasa, tau.',
      '{f} dari air ini. Berani juga kamu bawa pulang.',
    ],
    fishGeneral: [
      'Ikan di sini beda. Air buangan sudah puluhan tahun ngalir ke sini.',
      'Yang hidup di air hangat pipa itu bukan ikan aslinya lagi.',
      'Coba lempar dekat pipa. Yang aneh-aneh ngumpul di situ.',
    ],
    money: [
      'Semua di sini ada tagihannya. Termasuk lampunya.',
      'Sewa naik lagi. Papan reklamenya ga ikut naik terangnya.',
      'Kalau kamu punya koin, simpan. Di sini habis cepat.',
    ],
    story: [
      'Katanya ada yang mancing di sini terus dapat sesuatu yang bergerak sendiri.',
      'Blok lima kosong dua tahun. Lampunya masih nyala. Ga ada yang mau ngecek.',
      'Ada sinyal aneh dari antena tua itu. Sudah, jangan dipikirin.',
    ],
    joke: [
      'Saya teknisi. Artinya saya yang disalahin kalau lampu mati.',
      'Dua puluh papan reklame, ga ada satu pun yang saya bisa baca.',
      'Mancing di sini itu hobi paling murah. Sisanya bayar.',
    ],
    peopleMany: [
      'Ramai. Aneh. Biasanya orang ga ke sini kecuali kerja.',
      'Banyak orang di dermaga. Ada apa emangnya?',
    ],
    peopleFew: [
      'Sepi. Ya biasa. Yang di sini cuma yang harus di sini.',
      'Cuma kita sama papan reklame.',
    ],
    self: [
      'Saya yang benerin lampu blok ini. Semuanya. Sendirian.',
      'Saya tinggal di lantai enam. Jendelanya ga bisa dibuka.',
      'Sudah delapan tahun di sini. Belum pernah lihat bintang.',
    ],
    meet: [
      'Baru ya? Jangan pegang pipa yang bawah.',
      'Orang baru. Oke. Jangan berdiri di bawah papan itu.',
      'Kamu bukan orang sini. Ya udah, ga masalah.',
    ],
    gap: [
      'Lama ga muncul, {p}. Kirain pindah blok.',
      'Kemana aja? Lampu sini ga nanya, saya yang nanya.',
      'Beberapa hari ga keliatan. Sibuk?',
      'Sudah lama. Papan reklamenya udah ganti dua kali.',
    ],
    newday: [
      'Shift baru. Halo, {p}.',
      'Semalam trafo blok dua mati. Baru nyala lagi jam empat.',
      'Hari baru, tagihan baru.',
      'Pagi. Atau sore. Susah bedain di sini.',
    ],
    again: ['Kamu lagi.', 'Balik lagi?', 'Ga ada kerjaan ya.'],
    memRecord: [
      '{s} {v} senti. Itu masih rekor blok ini, tau.',
      'Belum ada yang lewat {v} senti punya kamu.',
    ],
    memRare: [
      'Saya masih mikirin {s} yang kamu tarik itu. Aneh.',
      '{s}. Ga ada di daftar mana-mana, itu.',
    ],
    memAbsence: [
      'Kemarin saya sempat nyari kamu di dermaga. Ga ada.',
      'Jangan ilang lama-lama. Di sini orang gampang lupa.',
    ],
    closeWarm: ['Balik lagi kapan-kapan, {p}.', 'Hati-hati pipanya.', 'Kalau lampu mati, cari saya.'],
    closeCold: ['Saya lagi kerja.', 'Udah, ya.', 'Ga sekarang.'],
    closeFlat: ['Ya udah.', 'Sana.', 'Oke.'],
  },

  // ----------------------------------------------------------- fantasy
  // Indirect and unhurried. Speaks about the grove as something that
  // notices you, and never quite finishes a thought.
  fantasy: {
    rain: [
      'Hujan di sini tidak jatuh. Ia turun pelan-pelan, seperti sedang berpikir.',
      'Jamur-jamur menyala lebih terang kalau basah. Entah kenapa.',
      'Air hujan yang masuk ke kolam itu tidak pernah keluar lagi.',
    ],
    dry: [
      'Kering begini cahayanya lebih jelas kelihatan.',
      'Dengar. Kalau tidak ada hujan, kamu bisa dengar akarnya.',
      'Udaranya diam. Itu artinya sesuatu sedang tidur.',
    ],
    pagi: [
      'Pagi di rimbun ini datang terlambat. Cahayanya harus lewat banyak daun.',
      'Embun di jamur itu tidak pernah kering sebelum tengah hari.',
    ],
    siang: [
      'Siang pun di sini tetap remang. Sudah begitu dari dulu.',
      'Cahaya matahari dan cahaya jamur bertemu jam segini. Warnanya aneh.',
    ],
    senja: [
      'Menjelang gelap, kolamnya paling terang. Kebalikan dari semestinya.',
      'Sore adalah waktu yang paling ramah di sini.',
    ],
    malam: [
      'Malam bukan waktu yang buruk di sini. Justru sebaliknya.',
      'Kalau kamu diam cukup lama, cahayanya akan mendekat.',
      'Jangan ikuti cahaya yang bergerak menjauh.',
    ],
    fishRecent: [
      '{f}. Ia membiarkan dirimu menariknya.',
      'Kamu dapat {f}? Berarti kolamnya sedang tidak keberatan.',
      '{f}. Kembalikan sisiknya ke air kalau kamu ingat.',
    ],
    fishGeneral: [
      'Ikan di sini tidak lapar. Mereka hanya penasaran.',
      'Kalau kailmu tidak disentuh, bukan berarti tidak ada yang datang.',
      'Lempar pelan. Airnya tidak suka dikejutkan.',
    ],
    money: [
      'Koin tidak berarti apa-apa di bawah pohon ini.',
      'Ada yang datang ke sini membawa emas. Mereka pulang tetap membawa emas.',
    ],
    story: [
      'Kata orang, kolam itu sudah menyala sebelum ada yang tinggal di sini.',
      'Batu-batu bertulis itu bukan kami yang menaruh.',
      'Ada satu pohon yang tidak pernah ikut bergoyang. Jangan cari.',
      'Kalau bayanganmu sampai duluan, berhentilah berjalan.',
    ],
    joke: [
      'Aku pernah bertanya pada pohon. Ia tidak menjawab. Aku tetap merasa didengar.',
      'Di sini tidak ada yang tersesat. Yang ada, tertahan sebentar.',
    ],
    peopleMany: [
      'Banyak yang datang hari ini. Rimbun ini jarang seramai ini.',
      'Cahayanya lebih terang kalau ada banyak orang. Aku tidak tahu kenapa.',
    ],
    peopleFew: [
      'Hanya kamu. Dan yang lain, tentu saja.',
      'Sepi. Tapi tidak pernah benar-benar sendirian di sini.',
    ],
    self: [
      'Aku sudah lama di sini. Aku lupa berapa lama, dan itu tidak mengganggu.',
      'Aku menjaga batu-batu itu. Atau mereka yang menjagaku.',
      'Aku datang untuk semalam. Itu beberapa musim yang lalu.',
    ],
    meet: [
      'Ah. Kamu sampai juga.',
      'Rimbun ini membiarkanmu masuk. Itu berarti sesuatu.',
      'Selamat datang. Jangan terlalu banyak bertanya dulu.',
    ],
    gap: [
      'Kamu pergi lama. Rimbun ini sempat lupa bentukmu.',
      'Beberapa malam tanpa kamu, {p}. Kolamnya lebih diam.',
      'Ada yang menanyakanmu. Bukan orang.',
      'Kamu kembali. Bagus.',
    ],
    newday: [
      'Hari berganti. Cahayanya juga.',
      'Kamu datang lagi, {p}.',
      'Semalam ada yang bergerak di seberang kolam. Sudah pergi sekarang.',
      'Selamat pagi, kalau memang pagi.',
    ],
    again: ['Kamu belum jauh.', 'Masih di sini rupanya.', 'Kembali begitu cepat.'],
    memRecord: [
      '{s} sepanjang {v} senti. Air ini masih menyimpan bentuknya.',
      'Yang {v} senti itu belum ada tandingannya.',
    ],
    memRare: [
      'Aku melihat {s} itu naik. Aku belum yakin itu benar-benar terjadi.',
      '{s}. Rimbun ini jarang melepaskan yang seperti itu.',
    ],
    memAbsence: [
      'Kolamnya sempat sunyi tanpa kamu.',
      'Jangan terlalu lama pergi. Tempat ini cepat lupa bentuk orang.',
    ],
    closeWarm: ['Datanglah lagi, {p}. Ia akan ingat.', 'Pergilah pelan-pelan.', 'Cahayanya akan mengantarmu.'],
    closeCold: ['Aku sedang mendengarkan sesuatu.', 'Nanti saja.', 'Diamlah sebentar.'],
    closeFlat: ['Baik.', 'Pergilah.', 'Sampai nanti.'],
  },
};

/** Fills the two slots the pools use. */
export function fill(
  line: string, playerName: string, fish: string, subject = '', value: number | string = '',
): string {
  return line
    .replace(/\{p\}/g, playerName)
    .replace(/\{f\}/g, fish)
    .replace(/\{s\}/g, subject)
    .replace(/\{v\}/g, String(value));
}
