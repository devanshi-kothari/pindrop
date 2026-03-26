type TravelPhrase = {
  phrase: string;
  translation: string;
};

type FoodSpotlight = {
  name: string;
  description: string;
  tags?: string[];
};

type CurrencyProfile = {
  name: string;
  code: string;
  symbol: string;
  usdRate: number; // 1 unit of local currency equals usdRate USD
  note?: string;
};

type DestinationProfile = {
  names: string[];
  country: string;
  language: {
    name: string;
    isEnglish?: boolean;
    phrases: TravelPhrase[];
    tip?: string;
  };
  foods: FoodSpotlight[];
  currency: CurrencyProfile;
};

export type TravelInformation = {
  matchedLocation: string;
  language: {
    name: string;
    isEnglish: boolean;
    phrases: TravelPhrase[];
    tip?: string;
  };
  food: {
    suggestions: FoodSpotlight[];
    appliedRestrictions: string[];
    usedFallback: boolean;
  };
  currency: CurrencyProfile & {
    inverseRate: number;
  };
};

const DESTINATION_PROFILES: DestinationProfile[] = [
  {
    names: ["france", "paris", "nice", "lyon", "marseille", "bordeaux"],
    country: "France",
    language: {
      name: "French",
      phrases: [
        { phrase: "Bonjour", translation: "Hello" },
        { phrase: "Merci", translation: "Thank you" },
        { phrase: "Parlez-vous anglais?", translation: "Do you speak English?" },
        { phrase: "Je voudrais...", translation: "I would like..." },
      ],
      tip: "Polite greetings go a long way—say bonjour before asking a question.",
    },
    foods: [
      { name: "Ratatouille", description: "Stewed summer vegetables with herbs.", tags: ["vegetarian", "vegan", "gluten-free"] },
      { name: "Croissant", description: "Buttery breakfast pastry from every boulangerie.", tags: ["vegetarian"] },
      { name: "Coq au vin", description: "Chicken braised in red wine with mushrooms.", tags: ["contains-meat"] },
      { name: "Salade Niçoise", description: "Salad with tuna, olives, egg, and green beans.", tags: ["pescatarian", "gluten-free"] },
    ],
    currency: { name: "Euro", code: "EUR", symbol: "EUR", usdRate: 1.08 },
  },
  {
    names: ["spain", "barcelona", "madrid", "seville", "valencia"],
    country: "Spain",
    language: {
      name: "Spanish",
      phrases: [
        { phrase: "Hola", translation: "Hello" },
        { phrase: "Gracias", translation: "Thank you" },
        { phrase: "¿Cuánto cuesta?", translation: "How much does it cost?" },
        { phrase: "¿Dónde está...?", translation: "Where is...?" },
      ],
      tip: "In Catalonia, basic Catalan greetings such as 'Bon dia' are appreciated.",
    },
    foods: [
      { name: "Paella Valenciana", description: "Rice dish with saffron, vegetables, and meats.", tags: ["contains-meat", "gluten-free"] },
      { name: "Patatas Bravas", description: "Fried potatoes with smoky tomato sauce.", tags: ["vegetarian", "vegan"] },
      { name: "Tortilla Española", description: "Thick potato and egg omelette.", tags: ["vegetarian", "gluten-free"] },
      { name: "Gazpacho", description: "Chilled tomato and cucumber soup.", tags: ["vegetarian", "vegan", "gluten-free"] },
    ],
    currency: { name: "Euro", code: "EUR", symbol: "EUR", usdRate: 1.08 },
  },
  {
    names: ["italy", "rome", "florence", "milan", "venice", "naples"],
    country: "Italy",
    language: {
      name: "Italian",
      phrases: [
        { phrase: "Buongiorno", translation: "Good morning" },
        { phrase: "Per favore", translation: "Please" },
        { phrase: "Grazie mille", translation: "Thank you very much" },
        { phrase: "Dov'è il bagno?", translation: "Where is the bathroom?" },
      ],
      tip: "A quick 'ciao' is informal; use buongiorno/buonasera with staff.",
    },
    foods: [
      { name: "Margherita Pizza", description: "Tomato, mozzarella, and basil—ask for wood-fired slices.", tags: ["vegetarian"] },
      { name: "Risotto alla Milanese", description: "Creamy saffron rice from Lombardy.", tags: ["gluten-free"] },
      { name: "Osso Buco", description: "Braised veal shanks over polenta.", tags: ["contains-meat"] },
      { name: "Pasta alla Norma", description: "Eggplant, tomato, ricotta salata from Sicily.", tags: ["vegetarian"] },
    ],
    currency: { name: "Euro", code: "EUR", symbol: "EUR", usdRate: 1.08 },
  },
  {
    names: ["japan", "tokyo", "kyoto", "osaka", "sapporo"],
    country: "Japan",
    language: {
      name: "Japanese",
      phrases: [
        { phrase: "Konnichiwa", translation: "Hello" },
        { phrase: "Arigatou gozaimasu", translation: "Thank you" },
        { phrase: "Sumimasen", translation: "Excuse me / sorry" },
        { phrase: "Eigo o hanasemasu ka?", translation: "Do you speak English?" },
      ],
      tip: "Carry cash—many small eateries are cash only.",
    },
    foods: [
      { name: "Sushi & Sashimi", description: "Ultra-fresh seafood over vinegared rice.", tags: ["pescatarian", "gluten-free"] },
      { name: "Tempura", description: "Lightly battered seafood or vegetables.", tags: ["pescatarian"] },
      { name: "Vegetable Ramen", description: "Brothy noodles with miso or shoyu base.", tags: ["vegetarian"] },
      { name: "Okonomiyaki", description: "Savory pancake with customizable fillings.", tags: ["vegetarian", "contains-meat"] },
    ],
    currency: { name: "Japanese Yen", code: "JPY", symbol: "JPY", usdRate: 0.0068, note: "Japan is largely cash-based; ATMs at convenience stores accept foreign cards." },
  },
  {
    names: ["mexico", "mexico city", "cancun", "tulum", "oaxaca", "guadalajara"],
    country: "Mexico",
    language: {
      name: "Spanish",
      phrases: [
        { phrase: "Buenos días", translation: "Good morning" },
        { phrase: "Por favor", translation: "Please" },
        { phrase: "La cuenta, por favor", translation: "The bill, please" },
        { phrase: "Sin carne", translation: "Without meat" },
      ],
      tip: "Learn 'sin hielo' if you prefer drinks without ice.",
    },
    foods: [
      { name: "Tacos al Pastor", description: "Spit-roasted pork with pineapple and salsa.", tags: ["contains-meat"] },
      { name: "Mole Negro", description: "Oaxacan sauce of chiles, chocolate, spices over chicken.", tags: ["contains-meat", "gluten-free"] },
      { name: "Tlayudas", description: "Oaxacan grilled tortilla with beans and toppings.", tags: ["vegetarian", "contains-meat"] },
      { name: "Chilaquiles Verde", description: "Salsa-soaked tortilla chips with crema and cheese.", tags: ["vegetarian"] },
    ],
    currency: { name: "Mexican Peso", code: "MXN", symbol: "MXN", usdRate: 0.058 },
  },
  {
    names: ["united kingdom", "uk", "england", "scotland", "london", "edinburgh"],
    country: "United Kingdom",
    language: {
      name: "English",
      isEnglish: true,
      phrases: [],
      tip: "Locals appreciate polite queues and 'cheers' as thanks.",
    },
    foods: [
      { name: "Fish and Chips", description: "Beer-battered cod with malt vinegar.", tags: ["pescatarian"] },
      { name: "Full English Breakfast", description: "Eggs, beans, mushrooms, sausage.", tags: ["contains-meat"] },
      { name: "Vegan Pie & Mash", description: "Plant-based take on a London pub classic.", tags: ["vegan"] },
      { name: "Afternoon Tea", description: "Finger sandwiches, scones, pastries.", tags: ["vegetarian"] },
    ],
    currency: { name: "British Pound Sterling", code: "GBP", symbol: "GBP", usdRate: 1.27 },
  },
  {
    names: ["canada", "toronto", "vancouver", "montreal", "banff"],
    country: "Canada",
    language: {
      name: "English & French",
      phrases: [
        { phrase: "Bonjour / Hello", translation: "Standard bilingual greeting" },
        { phrase: "Merci", translation: "Thank you (French)" },
        { phrase: "Où est...?", translation: "Where is...? (French)" },
      ],
      tip: "In Quebec, start in French—even switching to English is appreciated.",
    },
    foods: [
      { name: "Poutine", description: "Fries, gravy, cheese curds—veg gravy versions exist.", tags: ["vegetarian"] },
      { name: "Butter Tarts", description: "Classic dessert with flaky crust.", tags: ["vegetarian"] },
      { name: "Cedar-Plank Salmon", description: "Indigenous-inspired smoked salmon.", tags: ["pescatarian", "gluten-free"] },
      { name: "Tourtière", description: "Savory meat pie from Quebec.", tags: ["contains-meat"] },
    ],
    currency: { name: "Canadian Dollar", code: "CAD", symbol: "CAD", usdRate: 0.74 },
  },
  {
    names: ["india", "delhi", "mumbai", "jaipur", "bangalore", "goa"],
    country: "India",
    language: {
      name: "Hindi & English",
      phrases: [
        { phrase: "Namaste", translation: "Hello" },
        { phrase: "Dhanyavaad", translation: "Thank you" },
        { phrase: "Kitne ka hai?", translation: "How much is it?" },
        { phrase: "Shakahari", translation: "Vegetarian" },
      ],
      tip: "English is widely spoken in cities; learn a few Hindi words for bargaining.",
    },
    foods: [
      { name: "Masala Dosa", description: "Crispy rice crepe with potato masala.", tags: ["vegetarian", "vegan", "gluten-free"] },
      { name: "Chaat", description: "Tangy street snacks like pani puri.", tags: ["vegetarian"] },
      { name: "Butter Chicken", description: "Creamy tomato gravy with tandoori chicken.", tags: ["contains-meat", "gluten-free"] },
      { name: "Thali", description: "Sampler platter adjusting to dietary needs.", tags: ["vegetarian", "vegan"] },
    ],
    currency: { name: "Indian Rupee", code: "INR", symbol: "INR", usdRate: 0.012 },
  },
  {
    names: ["thailand", "bangkok", "chiang mai", "phuket", "koh samui"],
    country: "Thailand",
    language: {
      name: "Thai",
      phrases: [
        { phrase: "Sawasdee ka/krab", translation: "Hello (female/male)" },
        { phrase: "Khob khun ka/krab", translation: "Thank you" },
        { phrase: "Hong nam yoo tee nai?", translation: "Where is the bathroom?" },
        { phrase: "Mai sai nam pla", translation: "No fish sauce" },
      ],
      tip: "Wai (palms pressed) when greeting elders.",
    },
    foods: [
      { name: "Pad Thai", description: "Stir-fried rice noodles with tamarind sauce.", tags: ["vegetarian", "pescatarian"] },
      { name: "Som Tam", description: "Green papaya salad—ask for mild spice.", tags: ["vegetarian", "vegan", "gluten-free"] },
      { name: "Massaman Curry", description: "Southern curry with potatoes and peanuts.", tags: ["contains-meat"] },
      { name: "Khao Soi", description: "Coconut curry noodle soup from Chiang Mai.", tags: ["contains-meat"] },
    ],
    currency: { name: "Thai Baht", code: "THB", symbol: "THB", usdRate: 0.028 },
  },
  {
    names: ["australia", "sydney", "melbourne", "brisbane", "perth"],
    country: "Australia",
    language: {
      name: "English",
      isEnglish: true,
      phrases: [],
      tip: "Aussies abbreviate everything—'arvo' means afternoon.",
    },
    foods: [
      { name: "Flat White", description: "Silky espresso drink invented locally.", tags: ["vegetarian"] },
      { name: "Lamingtons", description: "Sponge cake squares with chocolate & coconut.", tags: ["vegetarian"] },
      { name: "Barramundi", description: "Local white fish, often grilled.", tags: ["pescatarian", "gluten-free"] },
      { name: "Beetroot Burger", description: "Veggie-forward burger topping staple.", tags: ["vegetarian"] },
    ],
    currency: { name: "Australian Dollar", code: "AUD", symbol: "AUD", usdRate: 0.66 },
  },
  {
    names: ["brazil", "rio", "rio de janeiro", "sao paulo", "salvador"],
    country: "Brazil",
    language: {
      name: "Portuguese",
      phrases: [
        { phrase: "Oi / Olá", translation: "Hi / Hello" },
        { phrase: "Por favor", translation: "Please" },
        { phrase: "Obrigado/a", translation: "Thank you" },
        { phrase: "Sem carne", translation: "Without meat" },
      ],
      tip: "In Brazil, informal greetings are common—use 'tudo bem?' to ask how someone is doing.",
    },
    foods: [
      { name: "Feijoada", description: "Black bean stew with pork, served Saturdays.", tags: ["contains-meat", "gluten-free"] },
      { name: "Pao de Queijo", description: "Chewy cheese bread made with cassava flour.", tags: ["vegetarian", "gluten-free"] },
      { name: "Moqueca", description: "Bahian seafood stew with coconut milk.", tags: ["pescatarian", "gluten-free"] },
      { name: "Acarajé", description: "Black-eyed pea fritters with vatapá filling.", tags: ["pescatarian"] },
    ],
    currency: { name: "Brazilian Real", code: "BRL", symbol: "BRL", usdRate: 0.20 },
  },
  {
    names: ["united arab emirates", "uae", "dubai", "abu dhabi"],
    country: "United Arab Emirates",
    language: {
      name: "Arabic & English",
      phrases: [
        { phrase: "As-salamu alaykum", translation: "Peace be upon you" },
        { phrase: "Shukran", translation: "Thank you" },
        { phrase: "Kam ath-thaman?", translation: "How much?" },
      ],
      tip: "English is widely spoken; basic Arabic greetings show respect.",
    },
    foods: [
      { name: "Shawarma", description: "Slow-roasted meat wrap with garlic sauce.", tags: ["contains-meat"] },
      { name: "Falafel & Hummus", description: "Chickpea fritters with dips.", tags: ["vegetarian", "vegan"] },
      { name: "Machboos", description: "Rice with spices and chicken or fish.", tags: ["contains-meat", "pescatarian"] },
      { name: "Luqaimat", description: "Date syrup dumplings for dessert.", tags: ["vegetarian"] },
    ],
    currency: { name: "UAE Dirham", code: "AED", symbol: "AED", usdRate: 0.27 },
  },
  {
    names: ["south africa", "cape town", "johannesburg", "durban"],
    country: "South Africa",
    language: {
      name: "11 official languages (English widely used)",
      phrases: [
        { phrase: "Howzit?", translation: "How are you? (informal greeting)" },
        { phrase: "Dankie", translation: "Thank you (Afrikaans)" },
        { phrase: "Sala kahle", translation: "Go well (Zulu)" },
      ],
      tip: "Switching between English and local greetings builds rapport.",
    },
    foods: [
      { name: "Bunny Chow", description: "Hollowed bread filled with curry.", tags: ["contains-meat", "vegetarian"] },
      { name: "Bobotie", description: "Cape Malay spiced baked custard over minced meat.", tags: ["contains-meat"] },
      { name: "Braai Vegetables", description: "Grilled seasonal veg at braais.", tags: ["vegetarian", "vegan", "gluten-free"] },
      { name: "Malva Pudding", description: "Sticky apricot dessert.", tags: ["vegetarian"] },
    ],
    currency: { name: "South African Rand", code: "ZAR", symbol: "ZAR", usdRate: 0.055 },
  },
  {
    names: ["turkey", "istanbul", "cappadocia", "antalya", "izmir"],
    country: "Turkey",
    language: {
      name: "Turkish",
      phrases: [
        { phrase: "Merhaba", translation: "Hello" },
        { phrase: "Tesekkür ederim", translation: "Thank you" },
        { phrase: "Ne kadar?", translation: "How much?" },
        { phrase: "Havalimani", translation: "Airport" },
      ],
      tip: "Locals appreciate attempts at Turkish even if they respond in English.",
    },
    foods: [
      { name: "Meze", description: "Small plates—many vegetarian like ezme or haydari.", tags: ["vegetarian"] },
      { name: "Doner Kebap", description: "Slow-roasted meat in pita.", tags: ["contains-meat"] },
      { name: "Imam Bayildi", description: "Stuffed eggplant simmered in olive oil.", tags: ["vegetarian", "vegan", "gluten-free"] },
      { name: "Baklava", description: "Layered pastry with nuts and honey.", tags: ["vegetarian"] },
    ],
    currency: { name: "Turkish Lira", code: "TRY", symbol: "TRY", usdRate: 0.032 },
  },
  {
    names: ["singapore"],
    country: "Singapore",
    language: {
      name: "English, Mandarin, Malay, Tamil",
      phrases: [
        { phrase: "Thank you / Terima kasih", translation: "Malay for thanks" },
        { phrase: "Where is the MRT?", translation: "Transit directions" },
      ],
      tip: "Most signage is in English; hawker stalls may prefer Mandarin or Malay.",
    },
    foods: [
      { name: "Hainanese Chicken Rice", description: "Poached chicken with fragrant rice.", tags: ["contains-meat", "gluten-free"] },
      { name: "Laksa", description: "Spicy coconut noodle soup.", tags: ["pescatarian"] },
      { name: "Roti Prata with Curry", description: "Flaky flatbread and dipping curry.", tags: ["vegetarian"] },
      { name: "Satay", description: "Grilled skewers with peanut sauce.", tags: ["contains-meat"] },
    ],
    currency: { name: "Singapore Dollar", code: "SGD", symbol: "SGD", usdRate: 0.74 },
  },
  {
    names: ["indonesia", "bali", "jakarta", "yogyakarta"],
    country: "Indonesia",
    language: {
      name: "Bahasa Indonesia",
      phrases: [
        { phrase: "Selamat pagi", translation: "Good morning" },
        { phrase: "Terima kasih", translation: "Thank you" },
        { phrase: "Berapa harganya?", translation: "How much is it?" },
        { phrase: "Tidak pedas", translation: "Not spicy" },
      ],
      tip: "In Bali, locals also speak Balinese—simple Bahasa works anywhere.",
    },
    foods: [
      { name: "Nasi Goreng", description: "Fried rice with sambal and egg.", tags: ["vegetarian", "contains-meat"] },
      { name: "Gado-Gado", description: "Veggies with peanut sauce.", tags: ["vegetarian", "vegan"] },
      { name: "Babi Guling", description: "Balinese roast pork feast.", tags: ["contains-meat"] },
      { name: "Tempeh Satay", description: "Grilled soybean cakes with peanut sauce.", tags: ["vegetarian", "vegan"] },
    ],
    currency: { name: "Indonesian Rupiah", code: "IDR", symbol: "IDR", usdRate: 0.000064 },
  },
  {
    names: ["china", "beijing", "shanghai", "chengdu", "xi'an"],
    country: "China",
    language: {
      name: "Mandarin Chinese",
      phrases: [
        { phrase: "Nǐ hǎo", translation: "Hello" },
        { phrase: "Xièxiè", translation: "Thank you" },
        { phrase: "Duōshao qián?", translation: "How much?" },
        { phrase: "Bù yào ròu", translation: "No meat" },
      ],
      tip: "Download an offline translation app; English is limited outside major hotels.",
    },
    foods: [
      { name: "Hot Pot", description: "Cook your own meats and vegetables in broth.", tags: ["contains-meat", "vegetarian"] },
      { name: "Mapo Tofu", description: "Spicy tofu with Sichuan peppercorn.", tags: ["vegetarian", "contains-meat"] },
      { name: "Xiaolongbao", description: "Soup dumplings from Shanghai.", tags: ["contains-meat"] },
      { name: "Dan Dan Noodles", description: "Chili oil noodles with sesame sauce.", tags: ["vegetarian"] },
    ],
    currency: { name: "Chinese Yuan", code: "CNY", symbol: "CNY", usdRate: 0.14 },
  },
  {
    names: ["germany", "berlin", "munich", "hamburg", "frankfurt"],
    country: "Germany",
    language: {
      name: "German",
      phrases: [
        { phrase: "Guten Tag", translation: "Good day" },
        { phrase: "Bitte", translation: "Please / you're welcome" },
        { phrase: "Sprechen Sie Englisch?", translation: "Do you speak English?" },
        { phrase: "Wo ist...?", translation: "Where is...?" },
      ],
      tip: "Cash preferred at smaller bakeries—have euros handy.",
    },
    foods: [
      { name: "Pretzel & Obatzda", description: "Soft pretzel with cheese spread.", tags: ["vegetarian"] },
      { name: "Schnitzel", description: "Breaded cutlet of pork or veal.", tags: ["contains-meat"] },
      { name: "Spätzle", description: "Egg noodles—try the cheese (Käsespätzle) version.", tags: ["vegetarian"] },
      { name: "Doner Kebap", description: "Turkish-German street food staple.", tags: ["contains-meat"] },
    ],
    currency: { name: "Euro", code: "EUR", symbol: "EUR", usdRate: 1.08 },
  },
  {
    names: ["united states", "usa", "new york", "los angeles", "san francisco", "chicago"],
    country: "United States",
    language: {
      name: "English",
      isEnglish: true,
      phrases: [],
      tip: "Tipping (18-20%) is expected at restaurants and bars.",
    },
    foods: [
      { name: "Regional BBQ", description: "Styles vary—Texas brisket to Carolina pulled pork.", tags: ["contains-meat"] },
      { name: "Farmers Market Bowls", description: "Seasonal produce in big cities.", tags: ["vegetarian", "vegan"] },
      { name: "Food Trucks", description: "Global fusion—look for vegan or gluten-free labels.", tags: ["vegetarian", "vegan", "gluten-free"] },
      { name: "Bagels & Lox", description: "NYC breakfast staple.", tags: ["pescatarian"] },
    ],
    currency: { name: "US Dollar", code: "USD", symbol: "$", usdRate: 1 },
  },
];

const FALLBACK_PROFILE: DestinationProfile = {
  names: ["default"],
  country: "Your destination",
  language: {
    name: "English",
    isEnglish: true,
    phrases: [],
    tip: "Add destination details to unlock more specific tips.",
  },
  foods: [
    { name: "Ask locals", description: "Every region has a specialty—check markets first.", tags: [] },
    { name: "Vegetable-forward bowls", description: "Easy to find in most cities worldwide.", tags: ["vegetarian", "vegan"] },
    { name: "Street food tour", description: "Look for stalls busy with locals.", tags: [] },
  ],
  currency: { name: "US Dollar", code: "USD", symbol: "$", usdRate: 1 },
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const mapDietaryRestriction = (input: string) => {
  const value = input.toLowerCase();
  if (value.includes("vegan")) return "vegan";
  if (value.includes("vegetarian")) return "vegetarian";
  if (value.includes("pesc")) return "pescatarian";
  if (value.includes("gluten")) return "gluten-free";
  if (value.includes("halal")) return "halal";
  if (value.includes("kosher")) return "kosher";
  if (value.includes("dairy")) return "dairy-free";
  if (value.includes("nut")) return "nut-free";
  return value;
};

const selectFoods = (foods: FoodSpotlight[], restrictions: Set<string>) => {
  if (foods.length === 0) {
    return { items: [] as FoodSpotlight[], usedFallback: false };
  }

  if (restrictions.size === 0) {
    return { items: foods.slice(0, 4), usedFallback: false };
  }

  const matches = foods.filter((food) => {
    if (!food.tags || food.tags.length === 0) return false;
    return food.tags.some((tag) => restrictions.has(tag));
  });

  if (matches.length > 0) {
    return { items: matches.slice(0, 4), usedFallback: false };
  }

  return { items: foods.slice(0, 3), usedFallback: true };
};

export const getTravelInformation = (
  destination: string | null | undefined,
  dietaryRestrictions: string[]
): TravelInformation => {
  const normalized = destination ? normalize(destination) : "";
  const profile =
    DESTINATION_PROFILES.find((entry) => entry.names.some((name) => normalized.includes(name))) ||
    FALLBACK_PROFILE;

  const restrictionsSet = new Set(
    dietaryRestrictions
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item))
      .map(mapDietaryRestriction)
  );

  const { items, usedFallback } = selectFoods(profile.foods, restrictionsSet);
  const isEnglish =
    profile.language.isEnglish ?? profile.language.name.toLowerCase().includes("english");
  const usdRate = profile.currency.usdRate || 1;

  return {
    matchedLocation: profile.country,
    language: {
      name: profile.language.name,
      isEnglish,
      phrases: isEnglish ? [] : profile.language.phrases,
      tip: profile.language.tip,
    },
    food: {
      suggestions: items,
      appliedRestrictions: Array.from(restrictionsSet),
      usedFallback,
    },
    currency: {
      ...profile.currency,
      inverseRate: usdRate > 0 ? 1 / usdRate : 0,
    },
  };
};
