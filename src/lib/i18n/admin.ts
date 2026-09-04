/**
 * The operations console's own dictionary — Georgian and English.
 *
 * Deliberately separate from the public en/ka/ru dictionaries: the console
 * is an internal tool for a Georgian team, Russian is not needed, and the
 * public parity test must not force every operational label through three
 * translations. Georgian is the default; English is what a staff account
 * with locale "en" sees, and the header carries a toggle.
 */
export type AdminLocale = "ka" | "en";

export const adminLocale = (locale: string): AdminLocale => (locale === "en" ? "en" : "ka");

type Entry = { ka: string; en: string };

const D = {
  // ---------------------------------------------------------------- shell --
  "shell.title": { ka: "ოპერაციები", en: "Operations" },
  "shell.searchPlaceholder": { ka: "მძღოლის ძებნა: სახელი, ტელეფონი, ნომერი…", en: "Find a driver: name, phone, plate…" },
  "shell.viewSite": { ka: "საიტის ნახვა", en: "View site" },
  "shell.signOut": { ka: "გასვლა", en: "Sign out" },
  "shell.groupOps": { ka: "ოპერაციები", en: "Operations" },
  "shell.groupContent": { ka: "შიგთავსი", en: "Content" },
  "shell.groupSystem": { ka: "სისტემა", en: "System" },
  "nav.dashboard": { ka: "სამართავი პანელი", en: "Command centre" },
  "nav.drivers": { ka: "მძღოლები", en: "Drivers" },
  "nav.bookings": { ka: "ჯავშნები", en: "Bookings" },
  "nav.support": { ka: "მხარდაჭერა", en: "Support" },
  "nav.schools": { ka: "სკოლები", en: "Schools" },
  "cr.formTitle": { ka: "ცვლილების მოთხოვნა", en: "Request a change" },
  "cr.formLead": { ka: "შენიშნეთ რამე, რაც უნდა შეიცვალოს? მოგვწერეთ. ანგარიში არ გჭირდებათ.", en: "Noticed something that should change? Tell us. You do not need an account." },
  "cr.shotsL": { ka: "ეკრანის სურათი", en: "Screenshot" },
  "cr.shotsH": { ka: "ჩასვით Ctrl+V-ით, ან აირჩიეთ ფაილი. სურათი ხშირად უფრო ნათლად ხსნის, ვიდრე ტექსტი.", en: "Paste with Ctrl+V, or choose a file. A picture usually explains it better than words." },
  "cr.shotsPick": { ka: "ფაილის არჩევა", en: "Choose a file" },
  "cr.shotsDrop": { ka: "ან ჩააგდეთ აქ", en: "or drop one here" },
  "cr.shotsRemove": { ka: "წაშლა", en: "Remove" },
  "cr.shotsMax": { ka: "მაქსიმუმ 5 სურათი.", en: "Up to 5 images." },
  "cr.errImage": { ka: "მხოლოდ სურათები — JPEG, PNG ან WebP.", en: "Images only — JPEG, PNG or WebP." },
  "cr.errLarge": { ka: "ფაილი ძალიან დიდია. მაქსიმუმ 12 MB.", en: "That file is too large. The limit is 12 MB." },
  "cr.step": { ka: "ნაბიჯი", en: "Step" },
  "cr.nameL": { ka: "თქვენი სახელი", en: "Your name" },
  "cr.nameH": { ka: "ვინ ითხოვს — რომ საჭიროების შემთხვევაში დაგიკავშირდეთ.", en: "So we know who asked, and can come back to you if needed." },
  "cr.titleL": { ka: "ერთი წინადადებით — რა უნდა შეიცვალოს?", en: "In one sentence — what should change?" },
  "cr.bodyL": { ka: "აღწერეთ დაწვრილებით", en: "Describe it" },
  "cr.bodyH": { ka: "რას აკეთებდით, რა მოხდა და რას ელოდით. კონკრეტული მაგალითი ყველაფერზე მეტად გვეხმარება.", en: "What you were doing, what happened, and what you expected. A concrete example helps more than anything else." },
  "cr.areaL": { ka: "რომელ ნაწილს ეხება?", en: "Which part of the product?" },
  "cr.submit": { ka: "მოთხოვნის გაგზავნა", en: "Send request" },
  "cr.sentT": { ka: "მიღებულია", en: "Received" },
  "cr.sentB": { ka: "თქვენი მოთხოვნის ნომერია {ref}. მას განვიხილავთ — თუ საკონტაქტო დატოვეთ, შედეგზე შეგატყობინებთ.", en: "Your request is {ref}. We will look at it, and if you left contact details we will tell you what happened." },
  "cr.errT": { ka: "ვერ გაიგზავნა", en: "That did not send" },
  "cr.errB": { ka: "შეამოწმეთ სავალდებულო ველები და სცადეთ ხელახლა.", en: "Check the required fields and try again." },
  "cr.throttledT": { ka: "ცოტა ხანში სცადეთ", en: "Try again shortly" },
  "cr.throttledB": { ka: "ბოლო ხანს ბევრი მოთხოვნა გამოგზავნეთ. ცოტა ხანში სცადეთ.", en: "You have sent several requests recently. Please try again in a little while." },
  "cr.another": { ka: "კიდევ ერთის გაგზავნა", en: "Send another" },
  "cr.aBOOKING": { ka: "ჯავშნები", en: "Bookings" },
  "cr.aDRIVER": { ka: "მძღოლები", en: "Drivers" },
  "cr.aSCHOOL": { ka: "სკოლები", en: "Schools" },
  "cr.aPRICING": { ka: "ფასები", en: "Pricing" },
  "cr.aADMIN": { ka: "ოპერაციების კონსოლი", en: "Operations console" },
  "cr.aPUBLIC_SITE": { ka: "საჯარო საიტი", en: "Public site" },
  "cr.aCONTENT": { ka: "ტექსტები და თარგმანები", en: "Text and translations" },
  "cr.aOTHER": { ka: "სხვა", en: "Something else" },
  "cr.uLOW": { ka: "დაბალი — როცა მოიცლით", en: "Low — whenever" },
  "cr.uNORMAL": { ka: "ჩვეულებრივი", en: "Normal" },
  "cr.uHIGH": { ka: "მაღალი — ხელს გვიშლის", en: "High — it is blocking us" },
  "nav.requests": { ka: "მოთხოვნები", en: "Requests" },
  "page.requests": { ka: "ცვლილების მოთხოვნები", en: "Change requests" },
  "page.requestsSub": { ka: "რასაც გუნდი ითხოვს. საჯარო ფორმიდან შემოსული მოთხოვნები.", en: "What the team has asked for, submitted through the form." },

  "nav.media": { ka: "ავტომობილის ფოტოები", en: "Vehicle photos" },
  "nav.reviews": { ka: "შეფასებები", en: "Reviews" },
  "nav.finance": { ka: "ფინანსები", en: "Finance" },
  "nav.locations": { ka: "ლოკაციები და მარშრუტები", en: "Locations & routes" },
  "nav.pricing": { ka: "ფასების ზღვრები", en: "Price bands" },
  "nav.tours": { ka: "ტურები", en: "Tours" },
  "nav.content": { ka: "ტექსტები", en: "Content" },
  "nav.images": { ka: "საიტის ფოტოები", en: "Photography" },
  "nav.staff": { ka: "თანამშრომლები", en: "Staff" },
  "nav.audit": { ka: "აუდიტის ჟურნალი", en: "Audit log" },

  // ------------------------------------------------------------ dashboard --
  "dash.title": { ka: "სამართავი პანელი", en: "Command centre" },
  "dash.subtitle": { ka: "რას სჭირდება ადამიანი დღეს — სასწრაფოობის მიხედვით.", en: "What needs a human today, ordered by urgency." },
  "dash.statQueue": { ka: "განაცხადები რიგში", en: "Applications in queue" },
  "dash.statDocs": { ka: "შესამოწმებელი დოკუმენტები", en: "Documents pending" },
  "dash.statVehicles": { ka: "შესამოწმებელი ავტომობილები", en: "Vehicles pending" },
  "dash.statPublished": { ka: "გამოქვეყნებული მძღოლები", en: "Published drivers" },
  "dash.statUnsigned": { ka: "ხელმოუწერელი ხელშეკრულებები", en: "Contracts unsigned" },
  "dash.statTickets": { ka: "ღია მიმართვები", en: "Open tickets" },
  "dash.statUnacked": { ka: "დაუდასტურებელი ჯავშნები", en: "Awaiting driver confirmation" },
  "dash.stat72h": { ka: "გასვლა 72 საათში", en: "Departing within 72h" },
  "dash.queueTitle": { ka: "შემოწმების რიგი", en: "Verification queue" },
  "dash.queueEmpty": { ka: "განსახილველი არაფერია.", en: "Nothing waiting for review." },
  "dash.expiringTitle": { ka: "დოკუმენტები, რომლებსაც 30 დღეში ვადა გასდით", en: "Documents expiring within 30 days" },
  "dash.expiringEmpty": { ka: "ვადის გასვლას არაფერი უახლოვდება.", en: "Nothing expiring soon." },
  "dash.ticketsTitle": { ka: "ღია მიმართვები", en: "Open tickets" },
  "dash.ticketsEmpty": { ka: "ღია მიმართვა არ არის.", en: "No open tickets." },
  "dash.review": { ka: "განხილვა", en: "Review" },
  "dash.open": { ka: "გახსნა", en: "Open" },
  "dash.supplyWarning": { ka: "პილოტის მიზანია მინიმუმ 30 გამოქვეყნებული მძღოლი. ამჟამად:", en: "The pilot target is at least 30 published drivers. Currently:" },

  // ----------------------------------------------------- platform settings --
  "settings.title": { ka: "პლატფორმის პარამეტრები", en: "Platform settings" },
  "settings.body": {
    ka: "ორი რიცხვი, რომელიც განსაზღვრავს რას იღებს RoutePlanner და რა ღირს მძღოლის ერთი დღე.",
    en: "The two numbers that decide what RoutePlanner earns and what a driver's day is worth.",
  },
  "settings.commission": { ka: "საკომისიო", en: "Commission" },
  "settings.commissionHint": {
    ka: "ტარიფის პროცენტი, მაგ. 15 ან 12.5. მაქსიმუმ 50%.",
    en: "Percent of the fare, e.g. 15 or 12.5. Maximum 50%.",
  },
  "settings.dayFare": { ka: "დღის მინიმალური საფასური", en: "Minimum fare per day" },
  "settings.dayFareHint": {
    ka: "ეხება მხოლოდ ტურებს და მრავალდღიან დაქირავებას — კილომეტრს არ ითვლის. 0 ნიშნავს გამორთულს. ტრანსფერზე არ მოქმედებს.",
    en: "Applies to tours and multi-day hire only — distance is not counted. 0 disables it. Transfers are never affected.",
  },
  "settings.save": { ka: "შენახვა", en: "Save settings" },
  "settings.warning": {
    ka: "ცვლილება ეხება მხოლოდ ახალ ფასებს და ახალ ხელმოწერებს. უკვე გაცემული ფასები და უკვე ხელმოწერილი ხელშეკრულებები ინახავს იმ განაკვეთს, რომელზეც შეთანხმდნენ — ეს ცვლილება მათ არ გადაწერს.",
    en: "A change applies to new quotes and new signatures only. Quotes already given and contracts already signed keep the rate that was agreed — this does not rewrite them.",
  },

  "finance.exposureT": { ka: "აუღებელი საკომისიო", en: "Uncollected commission" },
  "finance.exposureB": {
    ka: "{total} გვერგება {drivers} მძღოლისგან. მათგან {blocked} ლიმიტს გადასცდა და ნაღდი ანგარიშსწორებით ვეღარ მუშაობს. ავტომატური ჩამოჭრა არ გვაქვს — თანხა ხელით უნდა აიკრიფოს.",
    en: "{total} is owed by {drivers} driver(s). {blocked} of them are over the limit and can no longer take cash work. There is no automatic deduction — this has to be collected by hand.",
  },

  // ----------------------------------------------------- publish readiness --
  "ready.title": { ka: "რა აკლია გამოქვეყნებამდე", en: "What is left before going live" },
  "ready.live": { ka: "ლაივში", en: "Live" },
  "ready.readyNow": { ka: "მზადაა გამოსაქვეყნებლად", en: "Ready to publish" },
  "ready.stepsLeft": { ka: "დარჩა {count}", en: "{count} left" },
  "ready.liveBody": { ka: "მძღოლი ჩანს ძებნაში და იღებს ჯავშნებს.", en: "This driver appears in search and can take bookings." },
  "ready.readyBody": { ka: "ყველა პირობა შესრულებულია. დააჭირეთ „გამოქვეყნება ძებნაში“.", en: "Every condition is met. Use Publish to search below." },
  "ready.blockedBody": {
    ka: "დამტკიცება ექვსი პირობიდან მხოლოდ ერთია. სანამ ყველა არ შესრულდება, გამოქვეყნება არ იმუშავებს.",
    en: "Approving the application is one of six conditions. Publishing stays blocked until all of them are met.",
  },
  "ready.actorYou": { ka: "თქვენ", en: "You" },
  "ready.actorDriver": { ka: "მძღოლი", en: "The driver" },
  "ready.reviewed": { ka: "განაცხადი დამტკიცებულია", en: "Application approved" },
  "ready.reviewedNote": { ka: "გამოიყენეთ ქვემოთ „გადაწყვეტილება“.", en: "Use the decision panel below." },
  "ready.identity": { ka: "პირადობა დამოწმებულია", en: "Identity document approved" },
  "ready.licence": { ka: "მართვის მოწმობა დამოწმებულია", en: "Driving licence approved" },
  "ready.docWaiting": { ka: "ატვირთულია — გელოდებათ შემოწმება.", en: "Uploaded — waiting for your review." },
  "ready.docMissing": { ka: "ჯერ არ აუტვირთავს თავისი პორტალიდან.", en: "Not uploaded yet from their portal." },
  "ready.vehicle": { ka: "ავტომობილი დამტკიცებულია", en: "Vehicle approved" },
  "ready.vehicleWaiting": { ka: "დამატებულია — გელოდებათ შემოწმება.", en: "Added — waiting for your review." },
  "ready.vehicleMissing": { ka: "ავტომობილი ჯერ არ დაუმატებია.", en: "No vehicle added yet." },
  "ready.vehicleRejected": { ka: "ავტომობილი არ არის დამტკიცებული.", en: "The vehicle is not approved." },
  "ready.pricing": { ka: "ფასები დაყენებულია", en: "Pricing set" },
  "ready.pricingNote": { ka: "მძღოლმა უნდა შეავსოს ფასები თავის პორტალში.", en: "The driver sets this in their own portal." },
  "ready.contract": { ka: "ხელშეკრულება ხელმოწერილია ({version})", en: "Agreement signed ({version})" },
  "ready.contractNote": { ka: "მხოლოდ მძღოლს შეუძლია ხელმოწერა — ჩვენ ვერ მოვაწერთ მის ნაცვლად.", en: "Only the driver can sign this — we cannot sign on their behalf." },
  "ready.expired": { ka: "ვადაგასული დოკუმენტი", en: "An expired document" },
  "ready.expiredNote": { ka: "საჭიროა ახალი ატვირთვა.", en: "A fresh upload is required." },

  // -------------------------------------------------------------- drivers --
  "drivers.title": { ka: "მძღოლები", en: "Drivers" },
  "drivers.records": { ka: "ჩანაწერი", en: "record(s)" },
  "drivers.all": { ka: "ყველა", en: "All" },
  "drivers.searchLabel": { ka: "ძებნა", en: "Search" },
  "drivers.searchHint": { ka: "სახელი, ელფოსტა, ტელეფონი, ავტომობილის ნომერი", en: "Name, email, phone or number plate" },
  "drivers.colDriver": { ka: "მძღოლი", en: "Driver" },
  "drivers.colStatus": { ka: "სტატუსი", en: "Status" },
  "drivers.colLive": { ka: "ლაივში", en: "Live" },
  "drivers.colVehicles": { ka: "ავტომობილები", en: "Vehicles" },
  "drivers.colTrips": { ka: "მგზავრობები", en: "Trips" },
  "drivers.colRating": { ka: "შეფასება", en: "Rating" },
  "drivers.colContact": { ka: "კონტაქტი", en: "Contact" },
  "drivers.open": { ka: "გახსნა", en: "Open" },
  "drivers.live": { ka: "ლაივი", en: "Live" },
  "drivers.addDriver": { ka: "მძღოლის დამატება", en: "Add a driver" },
  "drivers.noResults": { ka: "ამ ძებნით მძღოლი ვერ მოიძებნა.", en: "No driver matches this search." },

  // -------------------------------------------------- driver detail panels --
  "driver.contactTitle": { ka: "კონტაქტი", en: "Contact" },
  "driver.base": { ka: "ბაზა", en: "Base" },
  "driver.notSet": { ka: "მითითებული არ არის", en: "not set" },
  "driver.applicationTitle": { ka: "განაცხადი", en: "Application" },
  "driver.agreementTitle": { ka: "მძღოლის ხელშეკრულება", en: "Driver agreement" },
  "driver.documentsTitle": { ka: "დოკუმენტები", en: "Documents" },
  "driver.vehiclesTitle": { ka: "ავტომობილები", en: "Vehicles" },
  "driver.languagesTitle": { ka: "ენები", en: "Languages" },
  "driver.historyTitle": { ka: "გადაწყვეტილებების ისტორია", en: "Decision history" },
  "driver.historyEmpty": { ka: "გადაწყვეტილება ჯერ არ ჩაწერილა.", en: "No decisions recorded yet." },

  "impersonate.title": { ka: "ნახვა მძღოლის თვალით", en: "View as this driver" },
  "impersonate.body": {
    ka: "ხსნის მძღოლის კონსოლს ზუსტად ისე, როგორც ამ მძღოლს უჩანს — პროფილი, ავტომობილი, ფასები, კალენდარი — და ცვლილებებიც ნამდვილია. ყველა მოქმედება აუდიტში თქვენი სახელით აღირიცხება. სესია ერთ საათში თავისით იხურება.",
    en: "Opens the driver console exactly as this driver sees it — profile, vehicle, pricing, calendar — and changes made there are real. Every action is audit-marked with your identity. The session ends itself after an hour.",
  },
  "impersonate.cta": { ka: "შესვლა როგორც ეს მძღოლი", en: "Open their console" },
  "impersonate.bannerTitle": { ka: "თქვენ ხედავთ პლატფორმას როგორც", en: "You are viewing the platform as" },
  "impersonate.bannerBody": { ka: "ყველა ცვლილება ნამდვილია და აუდიტში თქვენი სახელით ფიქსირდება.", en: "Every change here is real and is audit-marked with your identity." },
  "impersonate.exit": { ka: "დაბრუნება ადმინში", en: "Back to admin" },

  "editProfile.title": { ka: "პროფილის რედაქტირება", en: "Edit profile" },
  "editProfile.body": { ka: "ცვლილება მაშინვე აისახება. მიზეზი სავალდებულოა — აუდიტის ჩანაწერის ნაწილია.", en: "Changes apply immediately. The reason is required — it becomes part of the audit record." },
  "editProfile.publicName": { ka: "საჯარო სახელი", en: "Public name" },
  "editProfile.firstName": { ka: "სახელი", en: "Legal first name" },
  "editProfile.lastName": { ka: "გვარი", en: "Legal last name" },
  "editProfile.phone": { ka: "ტელეფონი", en: "Phone" },
  "editProfile.baseLocation": { ka: "საბაზო ლოკაცია", en: "Base location" },
  "editProfile.bio": { ka: "აღწერა", en: "Bio" },
  "editProfile.reason": { ka: "მიზეზი", en: "Reason" },
  "editProfile.save": { ka: "შენახვა", en: "Save changes" },

  "resetPw.title": { ka: "პაროლის განულება", en: "Reset password" },
  "resetPw.body": {
    ka: "ქმნის ერთჯერად პაროლს, ხურავს მძღოლის ყველა სესიას და პაროლს მხოლოდ ერთხელ აჩვენებს. გადაეცით მძღოლს პირადად ან ტელეფონით — ჩვენ პაროლებს არასდროს ვაგზავნით წერილით.",
    en: "Generates a one-time password, ends every session the driver has, and shows the password once. Hand it to the driver directly — we never email passwords.",
  },
  "resetPw.cta": { ka: "ახალი ერთჯერადი პაროლი", en: "Generate one-time password" },

  // ------------------------------------------------------------- statuses --
  "status.DRAFT": { ka: "მონახაზი", en: "Draft" },
  "status.SUBMITTED": { ka: "შემოსული", en: "Submitted" },
  "status.IN_REVIEW": { ka: "განხილვაში", en: "In review" },
  "status.CHANGES_REQUESTED": { ka: "ცვლილებები მოთხოვნილია", en: "Changes requested" },
  "status.APPROVED": { ka: "დამტკიცებული", en: "Approved" },
  "status.SUSPENDED": { ka: "შეჩერებული", en: "Suspended" },
  "status.REJECTED": { ka: "უარყოფილი", en: "Rejected" },

  "bstatus.PENDING_PAYMENT": { ka: "გადახდის მოლოდინში", en: "Pending payment" },
  "bstatus.CONFIRMED": { ka: "დადასტურებული", en: "Confirmed" },
  "bstatus.DRIVER_ACKNOWLEDGED": { ka: "მძღოლმა დაადასტურა", en: "Driver acknowledged" },
  "bstatus.READY": { ka: "მზადაა", en: "Ready" },
  "bstatus.DRIVER_ARRIVED": { ka: "მძღოლი ადგილზეა", en: "Driver arrived" },
  "bstatus.IN_PROGRESS": { ka: "მიმდინარეობს", en: "In progress" },
  "bstatus.COMPLETED": { ka: "დასრულებული", en: "Completed" },
  "bstatus.CANCELLED": { ka: "გაუქმებული", en: "Cancelled" },
  "bstatus.REASSIGNING": { ka: "გადანაწილება", en: "Reassigning" },
  "bstatus.DISPUTED": { ka: "სადავო", en: "Disputed" },
  "bstatus.CLOSED": { ka: "დახურული", en: "Closed" },
  "bstatus.EXPIRED": { ka: "ვადაგასული", en: "Expired" },

  // ------------------------------------------------------ decision panels --
  "decision.title": { ka: "გადაწყვეტილება", en: "Decision" },
  "decision.current": { ka: "მიმდინარე", en: "Current" },
  "decision.setStatus": { ka: "სტატუსის შეცვლა", en: "Set status" },
  "decision.reasonHint": { ka: "ინახება სამუდამოდ აუდიტის ჟურნალში.", en: "Stored permanently in the audit log." },
  "decision.record": { ka: "გადაწყვეტილების ჩაწერა", en: "Record decision" },
  "publish.title": { ka: "გამოქვეყნება", en: "Publication" },
  "publish.visible": { ka: "ჩანს ძებნის შედეგებში.", en: "Visible in search results." },
  "publish.hidden": { ka: "მგზავრებს არ უჩანთ.", en: "Not visible to travellers." },
  "publish.remove": { ka: "ძებნიდან მოხსნა", en: "Remove from search" },
  "publish.publish": { ka: "გამოქვეყნება ძებნაში", en: "Publish to search" },
  "common.reason": { ka: "მიზეზი", en: "Reason" },
  "common.save": { ka: "შენახვა", en: "Save" },
  "common.set": { ka: "დაყენება", en: "Set" },
  "common.yes": { ka: "დიახ", en: "yes" },
  "common.no": { ka: "არა", en: "no" },
  "common.expired": { ka: "ვადაგასული", en: "expired" },
  "common.unverified": { ka: "დაუდასტურებელი", en: "unverified" },
  "common.approve": { ka: "დამტკიცება", en: "Approve" },
  "common.requestChanges": { ka: "ცვლილებების მოთხოვნა", en: "Request changes" },
  "common.reject": { ka: "უარყოფა", en: "Reject" },
  "common.suspend": { ka: "შეჩერება", en: "Suspend" },
  "common.retire": { ka: "ჩამოწერა", en: "Retire" },
  "common.publishWord": { ka: "გამოქვეყნება", en: "publish" },
  "common.inReview": { ka: "განხილვაში", en: "In review" },

  "lvl.BASIC": { ka: "საბაზისო", en: "basic" },
  "lvl.CONVERSATIONAL": { ka: "სასაუბრო", en: "conversational" },
  "lvl.FLUENT": { ka: "თავისუფლად", en: "fluent" },
  "lvl.NATIVE": { ka: "მშობლიური", en: "native" },

  "doc.IDENTITY": { ka: "პირადობა", en: "identity" },
  "doc.DRIVING_LICENSE": { ka: "მართვის მოწმობა", en: "driving licence" },
  "doc.VEHICLE_REGISTRATION": { ka: "ავტომობილის რეგისტრაცია", en: "vehicle registration" },
  "doc.INSURANCE": { ka: "დაზღვევა", en: "insurance" },
  "doc.INSPECTION": { ka: "ტექდათვალიერება", en: "technical inspection" },
  "doc.TRAINING": { ka: "ტრენინგი", en: "training" },
  "doc.OTHER": { ka: "სხვა", en: "other" },
  "dstate.PENDING": { ka: "მოლოდინში", en: "Pending" },
  "dstate.EXPIRED": { ka: "ვადაგასული", en: "Expired" },
  "vstate.RETIRED": { ka: "ჩამოწერილი", en: "Retired" },
  "vstate.PUBLISHED": { ka: "გამოქვეყნებული", en: "Published" },

  "col.type": { ka: "ტიპი", en: "Type" },
  "col.expires": { ka: "ვადა", en: "Expires" },
  "col.state": { ka: "სტატუსი", en: "State" },
  "col.note": { ka: "შენიშვნა", en: "Note" },
  "col.decision": { ka: "გადაწყვეტილება", en: "Decision" },
  "col.vehicle": { ka: "ავტომობილი", en: "Vehicle" },
  "col.plate": { ka: "ნომერი", en: "Plate" },
  "col.class": { ka: "კლასი", en: "Class" },
  "col.capacity": { ka: "ადგილები/ბარგი", en: "Seats/luggage" },
  "col.language": { ka: "ენა", en: "Language" },
  "col.declared": { ka: "დეკლარირებული", en: "Declared" },
  "col.verified": { ka: "დადასტურებული", en: "Verified" },
  "col.interview": { ka: "გასაუბრების ჩაწერა", en: "Record interview" },

  "upload.title": { ka: "დოკუმენტის ატვირთვა ამ მძღოლისთვის", en: "Upload a document for this driver" },
  "upload.body": { ka: "ოფისში ონბორდინგისთვის. ფაილი ჩვეულებრივ შესამოწმებლად ხვდება და ქვემოთ დამტკიცება მაინც სჭირდება.", en: "For office onboarding. It arrives as pending and still needs an approval below." },
  "upload.vehicle": { ka: "ავტომობილი (ავტომობილის დოკუმენტებისთვის)", en: "Vehicle (for vehicle documents)" },
  "upload.notVehicleSpecific": { ka: "ზოგადი — ავტომობილს არ ეხება", en: "Not vehicle-specific" },
  "upload.expiry": { ka: "ვადის გასვლის თარიღი", en: "Expiry date" },
  "upload.expiryHint": { ka: "სავალდებულოა მოწმობისა და დაზღვევისთვის.", en: "Required for licence and insurance." },
  "upload.number": { ka: "დოკუმენტის ნომერი", en: "Document number" },
  "upload.numberHint": { ka: "ინახება მხოლოდ ჰეშის სახით.", en: "Stored as a hash only." },
  "upload.file": { ka: "სკანი ან ფოტო", en: "Scan or photo" },
  "upload.submit": { ka: "ატვირთვა შესამოწმებლად", en: "Upload as pending" },

  "create.title": { ka: "მძღოლის დამატება", en: "Add a driver" },
  "create.body": { ka: "ქმნის ანგარიშს და იწყებს განაცხადს. დოკუმენტებს თავად ატვირთავენ და იმავე შემოწმებას გადიან — არცერთი ეტაპი არ იპარება.", en: "Creates their account and starts an application. They still upload their own documents and go through the same verification — this does not skip any check." },
  "create.displayName": { ka: "საჯარო სახელი", en: "Display name" },
  "create.displayNameHint": { ka: "მგზავრებს უჩანთ, მაგ. „გიორგი კ.“", en: "Shown publicly, e.g. “Giorgi K.”" },
  "create.email": { ka: "ელფოსტა", en: "Email" },
  "create.emailHint": { ka: "ამით შედიან სისტემაში.", en: "They sign in with this." },
  "create.language": { ka: "მათი ენა", en: "Their language" },
  "create.submit": { ka: "მძღოლის შექმნა", en: "Create driver" },
  "create.cancel": { ka: "გაუქმება", en: "Cancel" },

  // -------------------------------------------------- driver detail extra --
  "driver.suspendedTitle": { ka: "შეჩერებულია", en: "Suspended" },
  "driver.supportReadOnly": { ka: "თქვენი როლი ამ ჩანაწერს მხოლოდ კითხულობს — გადაწყვეტილებას ოპერაციების მენეჯერი იღებს.", en: "Your role can read this record but not decide on it. Decisions require an operations manager." },
  "driver.kycNote": { ka: "ფაილები შეზღუდული საცავიდან ნაკადურად მიეწოდება და პირდაპირი ბმულით არასდროს ქვეყნდება. ყოველი გახსნა აუდიტის ჟურნალში იწერება.", en: "Files are streamed from restricted storage, never linked directly. Every time a reviewer opens one it is written to the audit log." },
  "driver.srcPublic": { ka: "საჯარო ფორმით", en: "Public form" },
  "driver.srcStaff": { ka: "თანამშრომელმა შეიყვანა", en: "Entered by staff" },
  "driver.srcImport": { ka: "იმპორტი", en: "Imported" },
  "driver.source": { ka: "წყარო", en: "Source" },
  "driver.submittedAt": { ka: "გაგზავნილია", en: "Submitted" },
  "driver.born": { ka: "დაბადებული", en: "Born" },
  "driver.declaredExp": { ka: "დეკლარირებული გამოცდილება", en: "Declared experience" },
  "driver.heard": { ka: "საიდან შეიტყო", en: "Heard about us" },
  "driver.years": { ka: "წ.", en: "yr" },

  "agr.signed": { ka: "ხელმოწერილია", en: "Signed" },
  "agr.notSigned": { ka: "ხელმოუწერელი", en: "Not signed" },
  "agr.status": { ka: "სტატუსი", en: "Status" },
  "agr.version": { ka: "ვერსია", en: "Version" },
  "agr.signedAt": { ka: "ხელმოწერის დრო", en: "Signed" },
  "agr.nameTyped": { ka: "აკრეფილი სახელი", en: "Name typed" },
  "agr.language": { ka: "ენა", en: "Language" },
  "agr.fingerprint": { ka: "დოკუმენტის ანაბეჭდი", en: "Document fingerprint" },
  "agr.noCompany": { ka: "ხელშეკრულების შეთავაზება ჯერ შეუძლებელია: კომპანიის რეკვიზიტები ({fields}) შევსებული არ არის, ხელშეკრულება კი არარსებულ მხარეს ვერ დაასახელებს. შეავსეთ გარემოს ცვლადები და გამოაქვეყნეთ ვერსია.", en: "No agreement can be offered yet: {fields} not set, so the contract would name a counterparty that does not exist. Set them in the environment, then publish a contract version." },
  "agr.noVersion": { ka: "ხელშეკრულების ვერსია გამოქვეყნებული არ არის — ხელს ვერავინ მოაწერს და ლაივში ვერავინ გავა.", en: "No contract version is published, so nobody can sign one and nobody can go live." },
  "agr.waiting": { ka: "ვერსია {version} ელოდება ამ მძღოლს. დამტკიცებისას ეცნობა ელფოსტითა და SMS-ით. პროფილი ხელმოწერამდე ვერ გამოქვეყნდება.", en: "Version {version} is waiting for this driver. They were told by email and SMS when they were approved. This profile cannot be published until they sign." },

  // ---------------------------------------------------------- page titles --
  "page.bookings": { ka: "ჯავშნები", en: "Bookings" },
  "page.bookingsSub": { ka: "ჯერ ის, ვინც ყველაზე ადრე მიემგზავრება.", en: "Soonest departure first." },
  "page.support": { ka: "მხარდაჭერის მიმართვები", en: "Support tickets" },
  "page.supportSub": { ka: "სიმძიმე წყვეტს რეაგირებას — და არა ზარის ტონი.", en: "Severity decides the response, not the mood of the caller." },
  "page.financeSub": { ka: "წიგნი, ანგარიშსწორებები და ლიმიტები.", en: "The ledger, settlements and credit limits." },
  "page.pricingSub": { ka: "ზღვრები, რომლებშიც მძღოლის ფასი უნდა ჯდებოდეს.", en: "Guardrails that constrain what drivers may charge." },
  "page.auditSub": { ka: "დაუმატებელი და წაუშლელი — მხოლოდ წასაკითხი.", en: "Append-only and immutable — read it, never edit it." },
  "page.finance": { ka: "ფინანსები", en: "Finance" },
  "page.reviews": { ka: "შეფასებები", en: "Reviews" },
  "page.media": { ka: "ავტომობილის ფოტოები", en: "Vehicle photos" },
  "page.locations": { ka: "ლოკაციები და მარშრუტები", en: "Locations & routes" },
  "page.pricing": { ka: "ფასების ზღვრები", en: "Price bands" },
  "page.tours": { ka: "ტურები", en: "Tours" },
  "page.content": { ka: "ტექსტები", en: "Content" },
  "page.images": { ka: "საიტის ფოტოები", en: "Photography" },
  "page.staff": { ka: "თანამშრომლები", en: "Staff" },
  "page.audit": { ka: "აუდიტის ჟურნალი", en: "Audit log" },
  "page.reviewsSub": { ka: "გამოაქვეყნეთ ან უარყავით პირადი მონაცემების, მუქარისა და სპამის გამო — არასდროს კრიტიკის გამო.", en: "Publish or reject for personal data, threats and spam — never for being critical." },
  "page.mediaSub": { ka: "უარყავით ყველაფერი, რაც რეგისტრირებული ავტომობილი არ არის, ან სახეებს, სხვის ნომრებს ან საკონტაქტო მონაცემებს აჩვენებს.", en: "Reject anything that is not the registered vehicle, or that shows faces, other plates or contact details." },
  "page.toursSub": { ka: "სათაურები და აღწერები ყველა ენაზე.", en: "Titles, summaries and descriptions in every language." },
  "page.contentSub": { ka: "საჯარო საიტის ტექსტები, ენების მიხედვით.", en: "Editorial copy shown on the public site, per language." },
  "page.imagesSub": { ka: "ილუსტრაციების ჩანაცვლება ნამდვილი ფოტოებით.", en: "Replace the generated illustrations with real photographs." },
  "page.staffTitle": { ka: "თანამშრომლები და წვდომა", en: "Staff and access" },
  "page.staffSub": { ka: "ვინ შედის ოპერაციებში და რისი უფლება აქვს.", en: "Who can sign in to operations, and what they may do." },
  "page.financeDetail": { ka: "ჯამები წიგნიდან ითვლება და არა ჯავშნის სტრიქონებიდან.", en: "Summed from the ledger, not from booking rows." },

} satisfies Record<string, Entry>;

export type AdminKey = keyof typeof D;

export function adminT(locale: string) {
  const l = adminLocale(locale);
  return (key: AdminKey, vars?: Record<string, string | number>): string => {
    let value: string = D[key][l];
    if (vars) for (const [k, v] of Object.entries(vars)) value = value.replaceAll(`{${k}}`, String(v));
    return value;
  };
}

/** Driver status → label in the staff member's language. */
export function driverStatusLabel(status: string, locale: string): string {
  const key = `status.${status}` as AdminKey;
  return key in D ? adminT(locale)(key) : status;
}

export function bookingStatusLabel(status: string, locale: string): string {
  const key = `bstatus.${status}` as AdminKey;
  return key in D ? adminT(locale)(key) : status;
}

export function docTypeLabel(type: string, locale: string): string {
  const key = `doc.${type}` as AdminKey;
  return key in D ? adminT(locale)(key) : type.replaceAll("_", " ").toLowerCase();
}

/** Review states are shared by documents; driver statuses cover the rest. */
export function reviewStateLabel(state: string, locale: string): string {
  const own = `dstate.${state}` as AdminKey;
  if (own in D) return adminT(locale)(own);
  return driverStatusLabel(state, locale);
}

export function vehicleStateLabel(state: string, locale: string): string {
  const own = `vstate.${state}` as AdminKey;
  if (own in D) return adminT(locale)(own);
  return driverStatusLabel(state, locale);
}

export function proficiencyLabel(level: string, locale: string): string {
  const key = `lvl.${level}` as AdminKey;
  return key in D ? adminT(locale)(key) : level.toLowerCase();
}
