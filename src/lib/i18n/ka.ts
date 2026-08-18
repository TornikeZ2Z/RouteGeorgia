import type { Dictionary } from "./index";

/**
 * Georgian. This is the home market, so it is translated in full rather than
 * left to fall back — a Georgian driver reading half an English interface is
 * the wrong first impression for a company called Route Georgia.
 *
 * The brand name is transliterated, not translated.
 */
export const ka: Partial<Dictionary> = {
  "brand.name": "რუთ ჯორჯია",
  "brand.tagline": "კერძო მძღოლები საქართველოში, წინასწარი დაჯავშნით.",

  "nav.transfers": "ტრანსფერები",
  "nav.drivers": "მძღოლები",
  "nav.becomeDriver": "გახდი მძღოლი",
  "nav.signIn": "შესვლა",
  "nav.signOut": "გასვლა",

  "home.heroTitle": "დაჯავშნე კერძო მძღოლი საქართველოში",
  "home.heroSubtitle":
    "ფიქსირებული ფასი მთელ ავტომობილზე. კონკრეტული მძღოლი და მანქანა, შეთანხმებული მგზავრობამდე. ფასზე მოლაპარაკება გზაზე აღარ დაგჭირდება.",
  "home.searchCta": "მოძებნე მძღოლი",

  "search.from": "საიდან",
  "search.to": "სად",
  "search.date": "თარიღი და დრო",
  "search.passengers": "მგზავრები",
  "search.luggage": "ბარგი",
  "search.submit": "ძებნა",
  "search.resultsCount": "ხელმისაწვდომია {count} მძღოლი",
  "search.empty": "ამ მიმართულებით და დროზე მძღოლი ჯერ არ არის.",
  "search.emptyHelp": "სცადეთ სხვა დრო, ან დაგვიკავშირდით და ჩვენ მოვძებნით მძღოლს.",
  "search.priceForVehicle": "ფასი მთელ ავტომობილზე",
  "search.driveEstimate": "დაახლოებით {minutes} წუთი გზაში, {km} კმ",
  "search.estimateNote":
    "მგზავრობის დრო არ მოიცავს გაჩერებებს, საცობებს, საზღვარსა და ამინდით გამოწვეულ დაყოვნებას.",

  "driver.verified": "ვერიფიცირებული",
  "driver.languages": "ენები",
  "driver.vehicle": "ავტომობილი",
  "driver.seats": "{count} ადგილი",
  "driver.luggage": "{count} ჩანთა",
  "driver.trips": "{count} დასრულებული მგზავრობა",
  "driver.noReviews": "ახალია პლატფორმაზე",
  "driver.viewProfile": "პროფილის ნახვა",

  "common.back": "უკან",
  "common.save": "შენახვა",
  "common.cancel": "გაუქმება",
  "common.submit": "გაგზავნა",
  "common.loading": "იტვირთება…",
  "common.required": "სავალდებულო",
  "common.email": "ელფოსტა",
  "common.password": "პაროლი",
  "common.phone": "ტელეფონი",

  "auth.signInTitle": "შესვლა",
  "auth.signInSubtitle": "მძღოლები და თანამშრომლები აქ შედიან.",
  "auth.invalid": "ელფოსტა ან პაროლი არასწორია.",

  "footer.legal": "წესები და კონფიდენციალურობა",
  "footer.support": "მხარდაჭერა",
};
