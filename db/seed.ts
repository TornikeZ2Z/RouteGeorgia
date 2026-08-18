/**
 * Synthetic seed data. Everything here is invented for development: no
 * competitor driver, review, photo or copy is reproduced. Locations and
 * approximate road distances are public geographic facts.
 *
 *   npm run db:seed        (safe to re-run; it truncates first)
 */
import "dotenv/config";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

/**
 * JSONB parameters: always write `${JSON.stringify(value)}::text::jsonb`.
 *
 * postgres.js JSON-encodes any parameter it believes is destined for a jsonb
 * column, so `${JSON.stringify(v)}` and `${JSON.stringify(v)}::jsonb` BOTH
 * store a JSON *string* rather than an object. Every `->>` lookup then returns
 * NULL, silently — no error is raised. Routing the value through ::text first
 * forces a plain text bind that Postgres parses into a real object.
 *
 * tests/db.test.ts asserts jsonb_typeof(...) = 'object' to catch regressions.
 */

/**
 * Password for the seeded accounts.
 *
 * Generated per run rather than hard-coded, because this seed has been run
 * against a database that a public website reads from. A fixed password
 * printed in the README means anyone who finds the repository can sign in to
 * the operations console of a live deployment.
 *
 * Set SEED_PASSWORD to pin it if you want a stable local login.
 */
const PASSWORD =
  process.env.SEED_PASSWORD ??
  `dev-${randomBytes(9).toString("base64url")}`;

const LOCATIONS = [
  { slug: "tbilisi-airport", type: "AIRPORT",    en: "Tbilisi International Airport", ka: "თბილისის აეროპორტი", ru: "Аэропорт Тбилиси", lat: 41.6692, lon: 44.9547, seo: true },
  { slug: "tbilisi",         type: "CITY",       en: "Tbilisi",   ka: "თბილისი",  ru: "Тбилиси",  lat: 41.7151, lon: 44.8271, seo: true },
  { slug: "kutaisi-airport", type: "AIRPORT",    en: "Kutaisi International Airport", ka: "ქუთაისის აეროპორტი", ru: "Аэропорт Кутаиси", lat: 42.1767, lon: 42.4826, seo: true },
  { slug: "kutaisi",         type: "CITY",       en: "Kutaisi",   ka: "ქუთაისი",  ru: "Кутаиси",  lat: 42.2662, lon: 42.7180, seo: true },
  { slug: "batumi",          type: "CITY",       en: "Batumi",    ka: "ბათუმი",   ru: "Батуми",   lat: 41.6168, lon: 41.6367, seo: true },
  { slug: "batumi-airport",  type: "AIRPORT",    en: "Batumi International Airport",  ka: "ბათუმის აეროპორტი", ru: "Аэропорт Батуми", lat: 41.6102, lon: 41.5997, seo: true },
  { slug: "mtskheta",        type: "ATTRACTION", en: "Mtskheta",  ka: "მცხეთა",   ru: "Мцхета",   lat: 41.8458, lon: 44.7186, seo: true },
  { slug: "gudauri",         type: "RESORT",     en: "Gudauri",   ka: "გუდაური",  ru: "Гудаури",  lat: 42.4780, lon: 44.4780, seo: true },
  { slug: "kazbegi",         type: "TOWN",       en: "Kazbegi (Stepantsminda)", ka: "ყაზბეგი", ru: "Казбеги", lat: 42.6580, lon: 44.6408, seo: true },
  { slug: "sighnaghi",       type: "TOWN",       en: "Sighnaghi", ka: "სიღნაღი",  ru: "Сигнахи",  lat: 41.6198, lon: 45.9214, seo: true },
  { slug: "telavi",          type: "TOWN",       en: "Telavi",    ka: "თელავი",   ru: "Телави",   lat: 41.9192, lon: 45.4731, seo: true },
  { slug: "borjomi",         type: "RESORT",     en: "Borjomi",   ka: "ბორჯომი",  ru: "Боржоми",  lat: 41.8397, lon: 43.3806, seo: true },
  { slug: "mestia",          type: "TOWN",       en: "Mestia",    ka: "მესტია",   ru: "Местиа",   lat: 43.0450, lon: 42.7278, seo: true },
  { slug: "vardzia",         type: "ATTRACTION", en: "Vardzia",   ka: "ვარძია",   ru: "Вардзия",  lat: 41.3806, lon: 43.2847, seo: true },
  { slug: "sadakhlo-border", type: "BORDER",     en: "Sadakhlo (Armenia border)", ka: "სადახლო", ru: "Садахло", lat: 41.2100, lon: 44.7400, seo: false },
];

/**
 * Route families.
 *
 * `deadheadBps` is the share of the empty return leg charged to the customer.
 * The values below encode a real operating judgement:
 *   - airport ↔ city: the driver picks up a return fare easily → 10–15%
 *   - popular day-trip corridors: partial → 35–55%
 *   - remote mountain (Mestia, Kazbegi in winter): the driver returns empty
 *     with near certainty → 70–85%
 * These are the numbers to revise first from pilot data.
 */
const ROUTES = [
  { slug: "tbilisi-airport-tbilisi", from: "tbilisi-airport", to: "tbilisi",  km: 18,  min: 30,  ret: 18,  deadheadBps: 1000, riskBps: 10000, minFare: 3500 },
  { slug: "tbilisi-mtskheta",        from: "tbilisi",         to: "mtskheta", km: 25,  min: 40,  ret: 25,  deadheadBps: 2000, riskBps: 10000, minFare: 4500 },
  { slug: "tbilisi-sighnaghi",       from: "tbilisi",         to: "sighnaghi", km: 113, min: 130, ret: 113, deadheadBps: 5000, riskBps: 10000, minFare: 12000 },
  { slug: "tbilisi-telavi",          from: "tbilisi",         to: "telavi",   km: 96,  min: 115, ret: 96,  deadheadBps: 5000, riskBps: 10000, minFare: 11000 },
  { slug: "tbilisi-gudauri",         from: "tbilisi",         to: "gudauri",  km: 120, min: 150, ret: 120, deadheadBps: 6000, riskBps: 11500, minFare: 15000, fourByFour: false, note: "Jvari Pass can close in winter." },
  { slug: "tbilisi-kazbegi",         from: "tbilisi",         to: "kazbegi",  km: 156, min: 195, ret: 156, deadheadBps: 7500, riskBps: 12500, minFare: 20000, fourByFour: true,  note: "Mountain route. 4x4 and winter tyres required Nov–Apr." },
  { slug: "tbilisi-borjomi",         from: "tbilisi",         to: "borjomi",  km: 160, min: 165, ret: 160, deadheadBps: 5500, riskBps: 10000, minFare: 16000 },
  { slug: "tbilisi-batumi",          from: "tbilisi",         to: "batumi",   km: 372, min: 380, ret: 372, deadheadBps: 6000, riskBps: 10000, minFare: 35000 },
  { slug: "tbilisi-kutaisi",         from: "tbilisi",         to: "kutaisi",  km: 221, min: 220, ret: 221, deadheadBps: 5500, riskBps: 10000, minFare: 22000 },
  { slug: "kutaisi-airport-batumi",  from: "kutaisi-airport", to: "batumi",   km: 140, min: 145, ret: 140, deadheadBps: 4000, riskBps: 10000, minFare: 14000 },
  { slug: "kutaisi-airport-tbilisi", from: "kutaisi-airport", to: "tbilisi",  km: 240, min: 235, ret: 240, deadheadBps: 5500, riskBps: 10000, minFare: 24000 },
  { slug: "kutaisi-mestia",          from: "kutaisi",         to: "mestia",   km: 210, min: 270, ret: 210, deadheadBps: 8500, riskBps: 13000, minFare: 28000, fourByFour: true, note: "Remote Svaneti route; return fares are rare." },
  { slug: "batumi-airport-batumi",   from: "batumi-airport",  to: "batumi",   km: 8,   min: 20,  ret: 8,   deadheadBps: 1000, riskBps: 10000, minFare: 2500 },
  { slug: "borjomi-vardzia",         from: "borjomi",         to: "vardzia",  km: 100, min: 120, ret: 100, deadheadBps: 7000, riskBps: 11000, minFare: 13000 },
];

/** Rates are GEL minor units (tetri) per km. */
const BANDS = [
  { class: "ECONOMY", minKm: 60,  maxKm: 160, floor: 2500, ceiling: 90000,  overnight: 12000, season: 13000 },
  { class: "COMFORT", minKm: 80,  maxKm: 220, floor: 3500, ceiling: 120000, overnight: 15000, season: 13000 },
  { class: "MINIVAN", minKm: 110, maxKm: 300, floor: 5000, ceiling: 180000, overnight: 18000, season: 13000 },
  { class: "SUV_4X4", minKm: 120, maxKm: 340, floor: 6000, ceiling: 200000, overnight: 20000, season: 14000 },
  { class: "MINIBUS", minKm: 150, maxKm: 420, floor: 8000, ceiling: 260000, overnight: 22000, season: 13000 },
  { class: "PREMIUM", minKm: 200, maxKm: 600, floor: 12000, ceiling: 400000, overnight: 30000, season: 15000 },
];


/**
 * Curated tours. Geography and travel times are public facts; all descriptive
 * copy here is original and written for this project.
 *
 * A tour returns to where it started, so `return_km` is 0 and the loop
 * distance carries the whole journey. That is the difference between a tour
 * and a one-way transfer, and it is why the same pricing engine gives sensible
 * numbers for both.
 */
const TOURS = [
  {
    slug: "mtskheta-jvari-day-trip",
    origin: "tbilisi",
    days: 1,
    km: 62,
    minutes: 100,
    minFare: 12000,
    risk: 10000,
    ka: { title: "მცხეთა და ჯვარი ერთ დღეში",
          summary: "ძველი დედაქალაქი, მეექვსე საუკუნის მონასტერი ორი მდინარის შესართავთან და სადილი წყლის პირას — მარტივი ნახევარი დღე თბილისიდან." },
    ru: { title: "Мцхета и Джвари за один день",
          summary: "Древняя столица, монастырь VI века над слиянием двух рек и обед у воды — лёгкие полдня из Тбилиси." },
    title: "Mtskheta and Jvari in a day",
    summary: "The old capital, a sixth-century monastery above the meeting of two rivers, and lunch by the water — an easy half day from Tbilisi.",
    body: "Start at Jvari Monastery on the ridge, where the Aragvi and Mtkvari rivers meet below and visibly refuse to mix. Take a jacket: it is windy up there whatever the forecast says.\n\nDown in Mtskheta you have Svetitskhoveli Cathedral, an eleventh-century building that was the coronation and burial church of Georgian kings. The town itself is small enough to walk in an hour and has good churchkhela.\n\nMost drivers will suggest a riverside restaurant on the way back if you want lunch. Say so when you book and they will plan the timing around it.",
    stops: [
      ["tbilisi", 0, 0, "Pickup from your accommodation."],
      ["mtskheta", 22, 0, "Jvari Monastery first, then the town below."],
      ["tbilisi", 25, 0, "Back to Tbilisi. The return is included in the price."],
    ],
  },
  {
    slug: "kakheti-wine-day-trip",
    origin: "tbilisi",
    days: 1,
    km: 290,
    minutes: 330,
    minFare: 28000,
    risk: 10000,
    ka: { title: "კახეთის ღვინის მხარე",
          summary: "სიღნაღი მთის წვერზე, ბოდბის მონასტერი და მოქმედი მარანი ველზე, სადაც ქარვისფერი ღვინო დაიბადა." },
    ru: { title: "Винная Кахетия",
          summary: "Сигнахи на холме, монастырь Бодбе и работающая винодельня в долине, где родилось янтарное вино." },
    title: "Kakheti wine country",
    summary: "Sighnaghi on its hilltop, the Bodbe convent, and a working winery in the valley that invented amber wine.",
    body: "Kakheti is where Georgian wine actually comes from, and where qvevri — clay vessels buried in the ground — have been used for eight thousand years.\n\nBodbe Monastery comes first, with the Alazani Valley laid out below and the Caucasus behind it. Then Sighnaghi, a walled town on a ridge that takes about two hours to walk properly.\n\nThe winery stop is where the day earns its keep. Tastings are paid separately and directly — we do not mark them up, and your driver will not push you toward a particular cellar.",
    stops: [
      ["tbilisi", 0, 0, "An early start is worth it; this is a full day."],
      ["sighnaghi", 113, 0, "Bodbe Monastery, then the town walls."],
      ["telavi", 60, 0, "Lunch and a winery in the valley."],
      ["tbilisi", 96, 0, "Back by early evening."],
    ],
  },
  {
    slug: "kazbegi-gergeti-day-trip",
    origin: "tbilisi",
    days: 1,
    km: 312,
    minutes: 420,
    minFare: 42000,
    risk: 12500,
    fourByFour: true,
    ka: { title: "ყაზბეგი და გერგეტის ტაძარი",
          summary: "საქართველოს სამხედრო გზა რუსეთის საზღვრამდე და მეთოთხმეტე საუკუნის ტაძარი 2170 მეტრზე, მყინვარწვერის ფონზე." },
    ru: { title: "Казбеги и Гергетская церковь",
          summary: "Военно-Грузинская дорога до российской границы и церковь XIV века на высоте 2170 метров с Казбеком за спиной." },
    title: "Kazbegi and the Gergeti church",
    summary: "The Georgian Military Highway to the Russian border, and a fourteenth-century church at 2,170 metres with Mount Kazbek behind it.",
    body: "This is the drive people come to Georgia for. The Military Highway climbs through Ananuri fortress and the Jvari Pass to Stepantsminda, and the road itself is the attraction for most of the way.\n\nGergeti Trinity Church sits above the town with Mount Kazbek at 5,054 metres behind it when the cloud lifts. The final ascent is a rough track — this tour requires a 4x4 and the driver will take you up it.\n\nBe realistic about the day: seven hours of driving plus stops means leaving early and returning late. From November to April the pass can close at short notice, and we will move or refund rather than risk it.",
    stops: [
      ["tbilisi", 0, 0, "Leave by 08:00 to have daylight at the top."],
      ["gudauri", 120, 0, "Jvari Pass and the viewpoint over the valley."],
      ["kazbegi", 36, 0, "Gergeti Trinity Church, up the 4x4 track."],
      ["tbilisi", 156, 0, "Long drive back; expect to arrive after dark."],
    ],
  },
  {
    slug: "borjomi-vardzia-day-trip",
    origin: "tbilisi",
    days: 1,
    km: 520,
    minutes: 480,
    minFare: 48000,
    risk: 11000,
    ka: { title: "ბორჯომი და ვარძიის კლდის ქალაქი",
          summary: "მინერალური წყლები ტყიან ხეობაში, შემდეგ კი მეთორმეტე საუკუნის მონასტერი, კლდეში ამოკვეთილი ცამეტ იარუსად." },
    ru: { title: "Боржоми и пещерный город Вардзиа",
          summary: "Минеральные источники в лесистом ущелье, затем монастырь XII века, вырубленный в скале на тринадцати уровнях." },
    title: "Borjomi and the Vardzia cave city",
    summary: "Mineral springs in a forested gorge, then a twelfth-century monastery carved into a cliff face over thirteen levels.",
    body: "Borjomi is a spa town in a wooded gorge, and the park is worth the walk even if you do not drink the water — which is famously not to everyone's taste.\n\nVardzia is the reason to make the longer drive. Queen Tamar's monastery was cut into the rock in the twelfth century and once held hundreds of rooms across thirteen levels; an earthquake in 1283 sheared the outer wall away and exposed the whole thing in cross-section.\n\nIt is a long day — around eight hours of driving. Worth doing, but not to be combined with anything else.",
    stops: [
      ["tbilisi", 0, 0, "An early departure is needed for this one."],
      ["borjomi", 160, 0, "Mineral park and the gorge."],
      ["vardzia", 100, 0, "The cave monastery. Allow two hours."],
      ["tbilisi", 260, 0, "Direct return."],
    ],
  },
  {
    slug: "svaneti-three-days",
    origin: "kutaisi",
    days: 3,
    km: 640,
    minutes: 900,
    minFare: 120000,
    risk: 13000,
    fourByFour: true,
    ka: { title: "ზემო სვანეთი სამ დღეში",
          summary: "შუასაუკუნეების კოშკები ოთხკილომეტრიანი მწვერვალების ქვეშ, ხეობაში, რომელიც წლის დიდი ნაწილი მიუწვდომელი იყო." },
    ru: { title: "Верхняя Сванетия за три дня",
          summary: "Средневековые башни под четырёхтысячниками, в долине, которая большую часть года была практически недоступна." },
    title: "Upper Svaneti in three days",
    summary: "Medieval tower houses under 4,000-metre peaks, in a valley that was effectively unreachable for most of the year until recently.",
    body: "Svaneti is the most remote place in Georgia that you can reasonably drive to, and the defensive tower houses of Mestia and Ushguli have stood since the ninth century.\n\nDay one is the drive up from Kutaisi through the Enguri gorge — five hours, and genuinely spectacular. Day two goes to Ushguli, one of the highest continuously inhabited settlements in Europe, on a track that needs a 4x4 and a driver who has done it before. Day three returns.\n\nYour accommodation is booked and paid by you; the price here covers the vehicle, the driver, and their own lodging and meals for the two nights. That overnight cost is shown as a separate line in the quote rather than hidden in a per-kilometre rate.",
    stops: [
      ["kutaisi", 0, 0, "Depart mid-morning; the drive up is around five hours."],
      ["mestia", 210, 0, "Arrive in Mestia. Tower houses and the Svaneti museum."],
      ["mestia", 110, 1, "Out to Ushguli and back by 4x4 track — a full day."],
      ["kutaisi", 210, 2, "Return through the Enguri gorge."],
    ],
  },
];

/**
 * Tour long descriptions in Georgian and Russian — the editorial half of the
 * translation work. Written by the assistant; review by a native speaker is
 * expected before launch, which is why they live here in one obvious place.
 */
const TOUR_BODIES: Record<string, { ka: string; ru: string }> = {
  "mtskheta-jvari-day-trip": {
    ka: "დაიწყეთ ჯვრის მონასტრით ქედზე, საიდანაც ჩანს არაგვისა და მტკვრის შესართავი — ორი მდინარე, რომლებიც თვალსაჩინოდ არ ერევა ერთმანეთს. ქურთუკი თან წამოიღეთ: იქ ყოველთვის ქარია.\n\nმცხეთაში გელოდებათ სვეტიცხოველი — მეთერთმეტე საუკუნის ტაძარი, სადაც ქართველ მეფეებს აკურთხებდნენ და კრძალავდნენ. თავად ქალაქი ერთ საათში მოივლება და კარგი ჩურჩხელაც იშოვება.\n\nუკან დაბრუნებისას მძღოლების უმეტესობა მდინარის პირას სასადილოს შემოგთავაზებთ. თუ სადილი გინდათ, დაჯავშნისას გვითხარით და დრო ისე დაიგეგმება.",
    ru: "Начните с монастыря Джвари на хребте, откуда видно слияние Арагви и Куры — двух рек, которые заметно не смешиваются. Возьмите куртку: там всегда ветрено.\n\nВ Мцхете вас ждёт Светицховели — собор XI века, где короновали и хоронили грузинских царей. Сам городок обходится за час, и здесь продают отличную чурчхелу.\n\nНа обратном пути большинство водителей предложат ресторанчик у реки. Если хотите пообедать, скажите при бронировании — время рассчитают под это.",
  },
  "kakheti-wine-day-trip": {
    ka: "კახეთი ქართული ღვინის სამშობლოა, სადაც ქვევრი რვა ათასი წელია მიწაშია ჩაფლული.\n\nჯერ ბოდბის მონასტერი — ალაზნის ველი ფეხქვეშ და კავკასიონი ჰორიზონტზე. შემდეგ სიღნაღი, გალავნიანი ქალაქი ქედზე, რომლის სრულად მოვლას ორი საათი სჭირდება.\n\nმარნის მონახულება ამ დღის მთავარი წერტილია. დეგუსტაციებს ადგილზე თავად იხდით — ჩვენ ფასს არ ვამატებთ და მძღოლი კონკრეტული მარნისკენ არ გიბიძგებთ.",
    ru: "Кахетия — родина грузинского вина, где квеври закапывают в землю уже восемь тысяч лет.\n\nСначала монастырь Бодбе — Алазанская долина под ногами и Кавказский хребет на горизонте. Затем Сигнахи, обнесённый стеной город на гребне, на который нужно два часа.\n\nВизит на винодельню — главная точка дня. Дегустации вы оплачиваете на месте сами — мы не делаем наценку, и водитель не будет подталкивать вас к конкретному погребу.",
  },
  "kazbegi-gergeti-day-trip": {
    ka: "ეს ის გზაა, რომლის გამოც საქართველოში ჩამოდიან. სამხედრო გზა ანანურის ციხესა და ჯვრის უღელტეხილზე გადის სტეფანწმინდამდე, და გზა თავად არის ღირსშესანიშნაობა.\n\nგერგეტის სამება ქალაქის თავზე დგას, უკან კი — მყინვარწვერი, 5054 მეტრი, როცა ღრუბელი აიწევა. ბოლო აღმართი უხეში გზაა — ამ ტურს 4x4 სჭირდება და მძღოლი თავად აგიყვანთ.\n\nდღე რეალურად შეაფასეთ: შვიდი საათი გზაში ნიშნავს ადრე გასვლას და გვიან დაბრუნებას. ნოემბრიდან აპრილამდე უღელტეხილი გაფრთხილების გარეშე იკეტება — ასეთ დღეს გადავწევთ ან სრულად დაგიბრუნებთ თანხას.",
    ru: "Это та дорога, ради которой едут в Грузию. Военно-Грузинская дорога идёт через крепость Ананури и Крестовый перевал до Степанцминды, и сама дорога — главная достопримечательность.\n\nГергетская Троица стоит над городом, а за ней — Казбек, 5054 метра, когда поднимаются облака. Последний подъём — грубая грунтовка: для этого тура нужен 4x4, и водитель сам вас поднимет.\n\nОценивайте день реалистично: семь часов в пути — значит ранний выезд и позднее возвращение. С ноября по апрель перевал закрывается без предупреждения — в такой день мы перенесём поездку или вернём деньги полностью.",
  },
  "borjomi-vardzia-day-trip": {
    ka: "ბორჯომი კურორტია ტყიან ხეობაში, და პარკი ფეხით სასეირნოდ ღირს, წყალი რომც არ დალიოთ — რომელიც, ცნობილია, ყველას არ მოსწონს.\n\nვარძია კი უფრო შორი გზის მიზეზია. თამარ მეფის დროს კლდეში ცამეტ სართულად ნაკვეთი მონასტერი 1283 წლის მიწისძვრამ შუაზე გახსნა და მთელი ქალაქი განაკვეთში გამოჩნდა.\n\nგრძელი დღეა — რვა საათამდე გზაში. ღირს, მაგრამ სხვა არაფერი მიუმატოთ.",
    ru: "Боржоми — курорт в лесистом ущелье, и парк стоит прогулки, даже если не пить воду — которая, как известно, нравится не всем.\n\nА Вардзиа — причина дальней дороги. Монастырь, вырубленный в скале в тринадцать ярусов при царице Тамаре, землетрясение 1283 года вскрыло, как разрез — и весь город виден в профиль.\n\nДень длинный — до восьми часов в пути. Стоит того, но ничего больше к нему не добавляйте.",
  },
  "svaneti-three-days": {
    ka: "სვანეთი ყველაზე შორეული ადგილია საქართველოში, სადამდეც მანქანით მიხვალთ, და მესტიისა და უშგულის კოშკები მეცხრე საუკუნიდან დგას.\n\nპირველი დღე ქუთაისიდან ენგურის ხეობით ასვლაა — ხუთი საათი და მართლაც შთამბეჭდავი. მეორე დღეს უშგულში მიდიხართ, ევროპის ერთ-ერთ ყველაზე მაღალ მუდმივად დასახლებულ სოფელში, გზით, რომელსაც 4x4 და გამოცდილი მძღოლი სჭირდება. მესამე დღეს ბრუნდებით.\n\nთქვენს სასტუმროს თავად ჯავშნით და იხდით; აქ მოცემული ფასი ფარავს მანქანას, მძღოლს და მის ორ ღამისთევას კვებით. ეს ხარჯი ცალკე ხაზად ჩანს და არა კილომეტრებში ჩამალული.",
    ru: "Сванетия — самое дальнее место Грузии, куда можно доехать на машине, и башни Местии и Ушгули стоят с девятого века.\n\nПервый день — подъём из Кутаиси по Ингурскому ущелью: пять часов и по-настоящему захватывающе. Во второй день вы едете в Ушгули, одно из самых высоких постоянно обитаемых сёл Европы, по дороге, требующей 4x4 и опытного водителя. Третий день — возвращение.\n\nСвоё жильё вы бронируете и оплачиваете сами; цена здесь покрывает машину, водителя и его две ночёвки с питанием. Эта статья видна отдельной строкой, а не спрятана в километрах.",
  },
};

const FIRST = ["Giorgi","Levan","Nikoloz","Davit","Zurab","Irakli","Tornike","Vakhtang","Beka","Saba",
               "Luka","Otar","Shota","Gela","Mamuka","Rezo","Temur","Koba","Ilia","Aleksi",
               "Nino","Tamar","Salome","Ana","Mariam","Keti","Lika","Nana","Sopio","Elene",
               "Guram","Zaza","Malkhaz","Paata","Ramaz"];
const LAST = ["Beridze","Kapanadze","Gelashvili","Maisuradze","Giorgadze","Lomidze","Tsiklauri",
              "Nakashidze","Chkheidze","Abashidze","Kvaratskhelia","Jandieri","Mgeladze","Sturua","Tabidze"];

const CARS = [
  { make: "Toyota", model: "Prius",        class: "ECONOMY", seats: 3, luggage: 2, year: 2016 },
  { make: "Toyota", model: "Camry",        class: "COMFORT", seats: 4, luggage: 3, year: 2019 },
  { make: "Toyota", model: "Land Cruiser Prado", class: "SUV_4X4", seats: 5, luggage: 4, year: 2018, fourByFour: true },
  { make: "Mitsubishi", model: "Delica",   class: "SUV_4X4", seats: 7, luggage: 5, year: 2015, fourByFour: true },
  { make: "Mercedes-Benz", model: "Vito",  class: "MINIVAN", seats: 7, luggage: 7, year: 2020 },
  { make: "Mercedes-Benz", model: "Sprinter", class: "MINIBUS", seats: 16, luggage: 16, year: 2019 },
  { make: "Mercedes-Benz", model: "E-Class", class: "PREMIUM", seats: 3, luggage: 3, year: 2021 },
  { make: "Hyundai", model: "Elantra",     class: "ECONOMY", seats: 4, luggage: 2, year: 2018 },
  { make: "Kia",     model: "Carnival",    class: "MINIVAN", seats: 6, luggage: 6, year: 2020 },
  { make: "Ford",    model: "Transit",     class: "MINIBUS", seats: 14, luggage: 14, year: 2017 },
];

const LANGS = [
  ["ka", "NATIVE"], ["en", "FLUENT"], ["ru", "FLUENT"],
  ["en", "CONVERSATIONAL"], ["ru", "CONVERSATIONAL"], ["en", "BASIC"], ["tr", "CONVERSATIONAL"],
] as const;

/**
 * Deterministic pseudo-random so re-seeding produces identical fixtures.
 * mulberry32 — the previous linear congruential generator was poorly
 * distributed and never selected some vehicles at all.
 */
let seedState = 0x9e3779b9;
const rand = () => {
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

/**
 * Two modes, one file:
 *
 *   npm run db:seed          demo — full synthetic marketplace for development
 *   npm run db:seed:launch   launch — real reference data only, zero fiction
 *
 * The demo seed fabricates ratings, trip counts and verified languages, which
 * is useful on a laptop and dishonest on a public domain: a real visitor
 * would see social proof nothing ever earned, and could book a driver who
 * does not exist. Launch mode seeds locations, routes, price bands and tours
 * — the operator's reference data — plus one real admin account, and leaves
 * supply empty for real drivers onboarded through the console.
 */
const LAUNCH = process.env.SEED_MODE === "launch";

async function main() {
  // Refuse to wipe a database that has taken real bookings. Seeding is for
  // set-up, not something that should ever be able to erase trading history
  // because someone ran the wrong command against the wrong DATABASE_URL.
  const [existing] = await sql<{ bookings: number }[]>`
    SELECT count(*)::int AS bookings FROM bookings`;
  if (existing!.bookings > 0 && process.env.FORCE_RESET !== "yes") {
    console.error(
      `REFUSING TO SEED: this database contains ${existing!.bookings} booking(s).\n` +
      `Seeding truncates everything. If you are certain, run again with FORCE_RESET=yes.`,
    );
    await sql.end();
    process.exit(1);
  }

  console.log(`Seeding in ${LAUNCH ? "LAUNCH" : "demo"} mode …`);
  console.log("Clearing existing data …");
  // Note: truncating driver_profiles CASCADEs to ledger_accounts, so the
  // platform-wide accounts created by migration 0002 are recreated below.
  await sql`TRUNCATE users, locations, route_families, price_bands,
            driver_profiles, driver_languages, driver_documents, driver_decisions,
            vehicles, vehicle_media, price_plans, availability_blocks,
            route_searches, quotes, bookings, booking_status_history,
            booking_legs, booking_revisions, booking_access_tokens,
            payments, webhook_events, ledger_accounts, ledger_entries,
            driver_wallets, payouts, notifications, messages,
            reviews, review_tokens,
            content_pages, exchange_rates RESTART IDENTITY CASCADE`;
  // audit_logs is append-only and deliberately not truncated.

  await sql`
    INSERT INTO ledger_accounts (kind, driver_id, currency) VALUES
      ('CARD_CLEARING',    NULL, 'GEL'),
      ('CASH_WITH_DRIVER', NULL, 'GEL'),
      ('PLATFORM_REVENUE', NULL, 'GEL'),
      ('REFUNDS',          NULL, 'GEL'),
      ('PAYOUTS',          NULL, 'GEL')
    ON CONFLICT DO NOTHING`;

  const hash = await bcrypt.hash(PASSWORD, 10);

  console.log("Seeding locations and route families …");
  const locIds = new Map<string, string>();
  for (const l of LOCATIONS) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO locations (slug, type, name_en, name_ka, name_ru, lat, lon, seo_indexed)
      VALUES (${l.slug}, ${l.type}::location_type, ${l.en}, ${l.ka}, ${l.ru}, ${l.lat}, ${l.lon}, ${l.seo})
      RETURNING id`;
    locIds.set(l.slug, row!.id);
  }

  for (const r of ROUTES) {
    await sql`
      INSERT INTO route_families
        (slug, origin_id, destination_id, distance_km, drive_minutes, return_km,
         deadhead_recovery_bps, risk_factor_bps, min_fare_minor, requires_4x4, seasonal_note)
      VALUES (${r.slug}, ${locIds.get(r.from)!}::uuid, ${locIds.get(r.to)!}::uuid,
              ${r.km}, ${r.min}, ${r.ret}, ${r.deadheadBps}, ${r.riskBps}, ${r.minFare},
              ${r.fourByFour ?? false}, ${r.note ?? null})`;
  }

  console.log("Seeding price bands …");
  for (const b of BANDS) {
    await sql`
      INSERT INTO price_bands (class, min_rate_per_km_minor, max_rate_per_km_minor,
        min_fare_floor_minor, max_fare_ceiling_minor, max_overnight_minor, max_season_factor_bps)
      VALUES (${b.class}::vehicle_class, ${b.minKm}, ${b.maxKm}, ${b.floor}, ${b.ceiling},
              ${b.overnight}, ${b.season})`;
  }

  await sql`
    INSERT INTO exchange_rates (base, quote, rate_micro, as_of, provider) VALUES
      ('GEL','USD', 370000, now(), 'seed'),
      ('GEL','EUR', 340000, now(), 'seed')`;


  console.log("Seeding tours …");
  for (const t of TOURS) {
    const [tour] = await sql<{ id: string }[]>`
      INSERT INTO tours (slug, origin_id, duration_days, distance_km, drive_minutes,
                         return_km, deadhead_recovery_bps, risk_factor_bps,
                         min_fare_minor, requires_4x4)
      VALUES (${t.slug}, ${locIds.get(t.origin)!}::uuid, ${t.days}, ${t.km}, ${t.minutes},
              0, 0, ${t.risk}, ${t.minFare}, ${t.fourByFour ?? false})
      RETURNING id`;

    await sql`
      INSERT INTO tour_translations (tour_id, locale, title, summary, body)
      VALUES (${tour!.id}::uuid, 'en', ${t.title}, ${t.summary}, ${t.body})`;

    // Georgian and Russian get the title and summary — the parts a traveller
    // reads before deciding. The long body still falls back to English and is
    // logged as an outstanding translation.
    for (const [locale, copy] of [["ka", t.ka], ["ru", t.ru]] as const) {
      await sql`
        INSERT INTO tour_translations (tour_id, locale, title, summary, body)
        VALUES (${tour!.id}::uuid, ${locale}, ${copy.title}, ${copy.summary},
                ${TOUR_BODIES[t.slug]?.[locale] ?? ""})`;
    }

    for (const [index, [slug, legKm, day, notes]] of t.stops.entries()) {
      await sql`
        INSERT INTO tour_stops (tour_id, location_id, day_index, position, leg_km, notes)
        VALUES (${tour!.id}::uuid, ${locIds.get(slug as string)!}::uuid,
                ${day as number}, ${index}, ${legKm as number}, ${notes as string})`;
    }
  }

  if (LAUNCH) {
    // One real administrator, from the environment. The generated password is
    // printed once; everything else — more staff, drivers — is created from
    // inside the console where it is audited.
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail || !adminEmail.includes("@")) {
      console.error("LAUNCH mode needs ADMIN_EMAIL=you@yourdomain to create the first admin.");
      await sql.end();
      process.exit(1);
    }
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, email_verified_at, status)
      VALUES (${adminEmail}, ${hash}, now(), 'ACTIVE') RETURNING id`;
    await sql`INSERT INTO user_roles (user_id, role) VALUES (${admin!.id}::uuid, 'SUPER_ADMIN')`;

    console.log(`
Launch seed complete.
  ${LOCATIONS.length} locations, ${ROUTES.length} route families, ${TOURS.length} tours, ${BANDS.length} price bands
  0 drivers — onboard real ones at /admin/drivers
  1 administrator: ${adminEmail}

One-time password (shown once, change it after first sign-in):

    ${PASSWORD}

Before real customers:
  * review every route family's deadhead %, risk % and minimum fare — they are estimates
  * review the price bands per vehicle class with real driver economics
  * make sure the support mailbox on the contact page actually exists
`);
    await sql.end();
    return;
  }

  console.log("Seeding staff accounts …");
  const staff = [
    { email: "admin@example.com",   roles: ["SUPER_ADMIN"] },
    { email: "ops@example.com",     roles: ["OPERATIONS_MANAGER"] },
    { email: "support@example.com", roles: ["SUPPORT_AGENT"] },
    { email: "finance@example.com", roles: ["FINANCE_ADMIN"] },
  ];
  for (const s of staff) {
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, email_verified_at, status)
      VALUES (${s.email}, ${hash}, now(), 'ACTIVE') RETURNING id`;
    for (const role of s.roles) {
      await sql`INSERT INTO user_roles (user_id, role) VALUES (${u!.id}::uuid, ${role}::app_role)`;
    }
  }

  console.log("Seeding drivers …");
  const DRIVER_COUNT = 34;
  const usedHandles = new Set<string>();
  let published = 0;

  for (let i = 0; i < DRIVER_COUNT; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const publicName = `${first} ${last[0]}.`;
    let handle = `${first}-${last}`.toLowerCase();
    while (usedHandles.has(handle)) handle = `${handle}-${int(2, 99)}`;
    usedHandles.add(handle);

    // 26 fully live, 4 in the review queue, 2 needing changes, 2 draft:
    // the admin queue should have something in it on first run.
    const bucket = i < 26 ? "LIVE" : i < 30 ? "SUBMITTED" : i < 32 ? "CHANGES_REQUESTED" : "DRAFT";
    const status = bucket === "LIVE" ? "APPROVED" : bucket === "SUBMITTED" ? "SUBMITTED" : bucket;
    const isPublished = bucket === "LIVE";
    if (isPublished) published++;

    const [u] = await sql<{ id: string }[]>`
      INSERT INTO users (email, phone, password_hash, email_verified_at, locale, status)
      VALUES (${`driver${i + 1}@example.com`}, ${`+9955${int(10000000, 99999999)}`}, ${hash}, now(),
              ${pick(["ka", "en", "ru"])}, 'ACTIVE') RETURNING id`;
    await sql`INSERT INTO user_roles (user_id, role) VALUES (${u!.id}::uuid,
              ${bucket === "DRAFT" ? "DRIVER_APPLICANT" : "DRIVER"}::app_role)`;

    // Ratings must be generated as individual scores and then summed. Drawing
    // the total and the count independently produces averages above 5, which
    // is both impossible and the first thing a visitor notices.
    const ratingCount = isPublished ? int(0, 13) : 0;
    let ratingSum = 0;
    for (let r = 0; r < ratingCount; r++) {
      // Real marketplaces skew high: mostly 4s and 5s, an occasional 3.
      ratingSum += rand() < 0.75 ? 5 : rand() < 0.8 ? 4 : 3;
    }

    const base = pick(["tbilisi", "kutaisi", "batumi", "telavi"]);
    const [d] = await sql<{ id: string }[]>`
      INSERT INTO driver_profiles
        (user_id, handle, public_name, legal_first_name, legal_last_name, date_of_birth,
         base_location_id, bio, status, published, submitted_at, approved_at,
         rating_sum, rating_count, completed_trips, ack_on_time, ack_total)
      VALUES (${u!.id}::uuid, ${handle}, ${publicName}, ${first}, ${last},
              ${`19${int(65, 95)}-0${int(1, 9)}-1${int(0, 8)}`}::date,
              ${locIds.get(base)!}::uuid,
              ${`Professional driver based in ${base[0]!.toUpperCase() + base.slice(1)}. Comfortable on long intercity routes and mountain roads.`},
              ${status}::driver_status, ${isPublished},
              ${bucket === "DRAFT" ? null : new Date().toISOString()}::timestamptz,
              ${isPublished ? new Date().toISOString() : null}::timestamptz,
              ${ratingSum}, ${ratingCount},
              ${isPublished ? int(0, 40) : 0}, ${int(0, 20)}, ${int(0, 22)})
      RETURNING id`;
    const driverId = d!.id;

    // Languages: Georgian always, plus one or two others.
    await sql`INSERT INTO driver_languages (driver_id, language, declared_level, verified_level, verified_at)
              VALUES (${driverId}::uuid, 'ka', 'NATIVE', ${isPublished ? "NATIVE" : null}::proficiency,
                      ${isPublished ? new Date().toISOString() : null}::timestamptz)`;
    const extra = new Set<string>();
    for (let k = 0; k < int(1, 2); k++) {
      const [lang, level] = pick(LANGS);
      if (lang === "ka" || extra.has(lang)) continue;
      extra.add(lang);
      // Roughly two thirds of live drivers have an interview-verified level.
      const verified = isPublished && rand() < 0.66;
      await sql`INSERT INTO driver_languages (driver_id, language, declared_level, verified_level, verified_at)
                VALUES (${driverId}::uuid, ${lang}, ${level}::proficiency,
                        ${verified ? level : null}::proficiency,
                        ${verified ? new Date().toISOString() : null}::timestamptz)
                ON CONFLICT DO NOTHING`;
    }

    // Vehicle. Every third published driver is put on a 4x4 so the mountain
    // routes that require one (Kazbegi, Mestia) have genuine supply.
    const fourByFourCars = CARS.filter((c) => c.fourByFour);
    const car = isPublished && i % 4 === 0 ? pick(fourByFourCars) : pick(CARS);
    const plate = `${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}-${int(100, 999)}-${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}`;
    const [v] = await sql<{ id: string }[]>`
      INSERT INTO vehicles (driver_id, make, model, year, color, plate, class, seats, luggage,
                            amenities, capabilities, status, published)
      VALUES (${driverId}::uuid, ${car.make}, ${car.model}, ${car.year},
              ${pick(["white", "black", "silver", "grey", "blue"])}, ${plate},
              ${car.class}::vehicle_class, ${car.seats}, ${car.luggage},
              ${JSON.stringify({ air_conditioning: true, wifi: rand() < 0.4, pets_allowed: rand() < 0.3,
                                 child_seat: rand() < 0.5, smoke_free: true })}::text::jsonb,
              ${JSON.stringify({ four_wheel_drive: car.fourByFour ?? false,
                                 winter_tyres: (car.fourByFour ?? false) || rand() < 0.5,
                                 wheelchair_access: rand() < 0.1 })}::text::jsonb,
              ${isPublished ? "APPROVED" : "SUBMITTED"}::vehicle_status, ${isPublished})
      RETURNING id`;
    const vehicleId = v!.id;

    // Documents. Two live drivers get a near-expiry insurance so the admin
    // "expiring soon" panel is populated on a fresh install.
    const soon = isPublished && i % 13 === 0;
    const docs: [string, string | null][] = [
      ["IDENTITY", null],
      ["DRIVING_LICENSE", `20${int(28, 33)}-0${int(1, 9)}-1${int(0, 8)}`],
      ["INSURANCE", soon ? isoInDays(int(5, 25)) : `20${int(27, 30)}-0${int(1, 9)}-1${int(0, 8)}`],
      ["VEHICLE_REGISTRATION", null],
    ];
    for (const [type, expires] of docs) {
      await sql`
        INSERT INTO driver_documents (driver_id, vehicle_id, type, storage_key, mime_type,
                                      size_bytes, expires_on, is_mandatory, state, reviewed_at)
        VALUES (${driverId}::uuid,
                ${type === "VEHICLE_REGISTRATION" ? vehicleId : null}::uuid,
                ${type}::doc_type, ${`restricted-kyc/seed/${driverId}-${type.toLowerCase()}.pdf`},
                'application/pdf', ${int(80_000, 900_000)}, ${expires}::date, true,
                ${isPublished ? "APPROVED" : "PENDING"}::review_state,
                ${isPublished ? new Date().toISOString() : null}::timestamptz)`;
    }

    // Price plan, inside the band for the vehicle class.
    const band = BANDS.find((b) => b.class === car.class)!;
    const rate = int(band.minKm + 5, band.maxKm - 5);
    await sql`
      INSERT INTO price_plans (driver_id, vehicle_id, version, rate_per_km_minor, rate_per_minute_minor,
                               per_stop_fee_minor, overnight_fee_minor, minimum_fare_minor,
                               season_factor_bps, status, effective_from)
      VALUES (${driverId}::uuid, ${vehicleId}::uuid, 1, ${rate}, ${int(0, 40)}, ${int(0, 1500)},
              ${int(8000, band.overnight)}, ${band.floor}, ${pick([10000, 10000, 10500, 11000])},
              ${isPublished ? "ACTIVE" : "DRAFT"}::plan_status, now())`;

    // Every driver gets a wallet. The credit limit is what stops unpaid
    // cash commission from growing without anyone noticing.
    await sql`
      INSERT INTO driver_wallets (driver_id, credit_limit_minor)
      VALUES (${driverId}::uuid, 20000)
      ON CONFLICT (driver_id) DO NOTHING`;

    // A few busy blocks so availability filtering is visibly doing something.
    if (isPublished) {
      for (let b = 0; b < int(0, 3); b++) {
        const start = new Date(Date.now() + int(1, 40) * 86_400_000 + int(6, 18) * 3_600_000);
        const end = new Date(start.getTime() + int(3, 9) * 3_600_000);
        await sql`
          INSERT INTO availability_blocks (driver_id, period, kind, reason_category)
          VALUES (${driverId}::uuid,
                  tstzrange(${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz, '[)'),
                  'BUSY', 'other work')
          ON CONFLICT DO NOTHING`;
      }
    }
  }


  const counted = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM driver_profiles WHERE published`;
  const count = counted[0]?.count ?? 0;

  console.log(`
Seed complete.
  ${LOCATIONS.length} locations, ${ROUTES.length} route families, ${TOURS.length} tours, ${BANDS.length} price bands
  ${DRIVER_COUNT} drivers (${count} published, ${DRIVER_COUNT - published} awaiting review)

Sign in at http://localhost:3000/login
Password for ALL seeded accounts (generated for this run — copy it now):

    ${PASSWORD}

  admin@example.com    super admin
  ops@example.com      operations manager (approves drivers)
  support@example.com  support agent (read only — try it, it should be blocked)
  finance@example.com  finance admin
  driver1@example.com  a published driver
  driver27@example.com a driver awaiting review
`);
  await sql.end();
}

const isoInDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
