/**
 * Photography attribution.
 *
 * Destination and category photography sourced from Wikimedia Commons under
 * the licenses listed here — attribution is the price of free, and it is
 * cheap. Every entry links to the original file page. Route Planner's own
 * photographs (Gergeti, Ushguli, Old Tbilisi, the mountain roads) are noted
 * on the credits page separately. Generated from the import manifest; edit
 * deliberately.
 */
export interface PhotoCredit {
  subject: string;
  file: string;
  author: string;
  license: string;
  source: string;
}

export const PHOTO_CREDITS: PhotoCredit[] = [
  { subject: "bakhmaro", file: "Bakhmaro_2.jpg", author: "Nelson.ksk", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Bakhmaro_2.jpg" },
  { subject: "shekvetili", file: "Shekvetili_Park,_Georgia_22.jpg", author: "Kober", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Shekvetili_Park,_Georgia_22.jpg" },
  { subject: "ureki", file: "Ureki.jpg", author: "M.", license: "CC BY 3.0", source: "https://commons.wikimedia.org/wiki/File:Ureki.jpg" },
  { subject: "ambrolauri", file: "Ambrolauri_(Photo_A._Muhranoff,_2011).jpg", author: "Aleksey Muhranoff", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Ambrolauri_(Photo_A._Muhranoff,_2011).jpg" },
  { subject: "oni", file: "2025-06-20_View_of_Oni_2.jpg", author: "Alexkom000", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:2025-06-20_View_of_Oni_2.jpg" },
  { subject: "martvili", file: "Martvili canyon Gruzia 2019 1.jpg", author: "Karelj", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Martvili_canyon_Gruzia_2019_1.jpg" },
  { subject: "zugdidi", file: "ზუგდიდის_დადიანების_სასახლე_და_მუზეუმი.jpg", author: "Natia an", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:ზუგდიდის_დადიანების_სასახლე_და_მუზეუმი.jpg" },
  { subject: "bakuriani", file: "Bakurianiiiii.jpg", author: "at English Wikipedia", license: "Public domain", source: "https://commons.wikimedia.org/wiki/File:Bakurianiiiii.jpg" },
  { subject: "akhaltsikhe", file: "Akhalcikhe,_old_city_general_view.jpg", author: "I kynitsky", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Akhalcikhe,_old_city_general_view.jpg" },
  { subject: "abastumani", file: "Romanovs_Bath,_Abastumani.jpg", author: "Yasuhiro Kojima", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Romanovs_Bath,_Abastumani.jpg" },
  { subject: "kvareli", file: "Kvareli_Town_Center.jpg", author: "Gaga.vaa", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Kvareli_Town_Center.jpg" },
  { subject: "tsinandali", file: "Tsinandali_(1).jpg", author: "Archil sutiashvili", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Tsinandali_(1).jpg" },
  { subject: "batumi", file: "USS_Oak_Hill,_26th_MEU_Marines_Visit_Batumi,_Georgia_(40817303032).jpg", author: "Commander, U.S. Naval Forces Europe-Africa U.S. 6th Fleet", license: "Public domain", source: "https://commons.wikimedia.org/wiki/File:USS_Oak_Hill,_26th_MEU_Marines_Visit_Batumi,_Georgia_(40817303032).jpg" },
  { subject: "kutaisi", file: "Downtown_Kutaisi_&_White_Bridge_as_seen_from_Mt_Gora_(August_2011)-cropped.jpg", author: "Kober", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Downtown_Kutaisi_&_White_Bridge_as_seen_from_Mt_Gora_(August_2011)-cropped.jpg" },
  { subject: "telavi", file: "Rustaveli_Street,_Telavi.jpg", author: "Jelger Groeneveld", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Rustaveli_Street,_Telavi.jpg" },
  { subject: "sighnaghi", file: "Sighnagi_2009.jpg", author: "George Nikoladze", license: "Public domain", source: "https://commons.wikimedia.org/wiki/File:Sighnagi_2009.jpg" },
  { subject: "borjomi", file: "Panorama_of_Borjomi_from_the_cable_car.jpg", author: "Sergey Sebelev", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Panorama_of_Borjomi_from_the_cable_car.jpg" },
  { subject: "vardzia", file: "2025-05-25_Vardzia_9.jpg", author: "Alexkom000", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:2025-05-25_Vardzia_9.jpg" },
  { subject: "mtskheta", file: "View_to_Mtskheta_from_Jvari.jpg", author: "Jelger Groeneveld", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:View_to_Mtskheta_from_Jvari.jpg" },
  { subject: "gudauri", file: "Гудаури_-_panoramio_(48).jpg", author: "", license: "CC BY 3.0", source: "https://commons.wikimedia.org/wiki/File:Гудаури_-_panoramio_(48).jpg" },
  { subject: "svetitskhoveli", file: "Svetitskhoveli_Cathedral_09.23_(3).jpg", author: "This Photo was taken by Supanut Arunoprayote. Feel free to u", license: "CC BY 4.0", source: "https://commons.wikimedia.org/wiki/File:Svetitskhoveli_Cathedral_09.23_(3).jpg" },
  { subject: "sea", file: "Kobuleti beach Aug 2016.jpg", author: "Kober", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Kobuleti_beach_Aug_2016.jpg" },
  { subject: "wine", file: "Nekresi monastery interior (Photo A. Muhranoff)-1.jpg", author: "Aleksey Muhranoff", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Nekresi_monastery_interior_(Photo_A._Muhranoff)-1.jpg" },
];
