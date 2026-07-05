/**
 * ============================================================================
 *  INTERNAL NOTE — FICTIONAL DEMONSTRATION DATA ONLY
 * ----------------------------------------------------------------------------
 *  Every organization, customer and supplier defined or generated in this file
 *  is FICTIONAL and was invented solely for product demos, tutorials and
 *  marketing videos. The demo companies, their customers and their suppliers do
 *  NOT represent, copy or impersonate any real business, living or defunct. Any
 *  resemblance to a real company or person is coincidental.
 *
 *  Real consumer product / brand names (Coca-Cola, Maggi, Omo, Colgate, etc.)
 *  are used only as representative catalog items for demonstration inventory so
 *  the books look realistic to viewers; no affiliation or endorsement is
 *  implied. Prices, stock levels and all accounting activity are made up.
 * ============================================================================
 */

export type Category =
  | "soft_drink"
  | "water"
  | "juice"
  | "beer"
  | "hot_drink"
  | "condiment"
  | "dairy"
  | "snack"
  | "staple"
  | "cereal"
  | "household"
  | "personal_care"
  | "baby";

export const FOOD_BEV: Category[] = [
  "soft_drink", "water", "juice", "beer", "hot_drink",
  "condiment", "dairy", "snack", "staple", "cereal",
];
export const HOME_CARE: Category[] = ["household", "personal_care", "baby"];

export type CatalogItem = {
  sku: string;
  name: string;
  barcode: string;
  category: Category;
  unit: string;
  cost: number; // wholesale purchase cost, whole XAF
  price: number; // wholesale sale price, whole XAF
  tax: number; // default VAT %
};

// Cameroon standard VAT. Unprocessed staples are treated as exempt (0%).
const VAT = 19.25;

type Base = {
  brand: string;
  category: Category;
  unit: string;
  tax?: number;
  // [variant label, cost, price]
  variants: [string, number, number][];
};

// Base products expanded into pack/size variants. Costs/prices are invented
// wholesale figures in XAF that are plausible for a Cameroon distributor.
const BASES: Base[] = [
  // --- Soft drinks (sold by the case) ---
  { brand: "Coca-Cola", category: "soft_drink", unit: "case", variants: [["33cl x24", 4200, 5200], ["50cl x12", 3600, 4500], ["1L x12", 5400, 6600], ["1.5L x6", 3900, 4800]] },
  { brand: "Fanta Orange", category: "soft_drink", unit: "case", variants: [["33cl x24", 4200, 5200], ["1.5L x6", 3900, 4800]] },
  { brand: "Fanta Pamplemousse", category: "soft_drink", unit: "case", variants: [["33cl x24", 4200, 5200]] },
  { brand: "Sprite", category: "soft_drink", unit: "case", variants: [["33cl x24", 4200, 5200], ["1.5L x6", 3900, 4800]] },
  { brand: "Pepsi", category: "soft_drink", unit: "case", variants: [["33cl x24", 4000, 5000], ["1.5L x6", 3700, 4600]] },
  { brand: "Mirinda", category: "soft_drink", unit: "case", variants: [["33cl x24", 4000, 5000]] },
  { brand: "7Up", category: "soft_drink", unit: "case", variants: [["33cl x24", 4000, 5000]] },
  { brand: "Schweppes Tonic", category: "soft_drink", unit: "case", variants: [["33cl x24", 4600, 5700]] },
  { brand: "Orangina", category: "soft_drink", unit: "case", variants: [["33cl x24", 5200, 6400]] },
  { brand: "Top Ananas", category: "soft_drink", unit: "case", variants: [["33cl x24", 3800, 4700]] },
  { brand: "Top Grenadine", category: "soft_drink", unit: "case", variants: [["33cl x24", 3800, 4700]] },
  { brand: "Djino Cocktail", category: "soft_drink", unit: "case", variants: [["33cl x24", 3700, 4600]] },
  { brand: "Malta Guinness", category: "soft_drink", unit: "case", variants: [["33cl x24", 6000, 7300]] },

  // --- Water ---
  { brand: "Tangui", category: "water", unit: "case", variants: [["1.5L x6", 2400, 3000], ["50cl x12", 2600, 3300]] },
  { brand: "Supermont", category: "water", unit: "case", variants: [["1.5L x6", 2300, 2900]] },
  { brand: "Vitale", category: "water", unit: "case", variants: [["1.5L x6", 2200, 2800]] },
  { brand: "Evian", category: "water", unit: "case", variants: [["1.5L x6", 6800, 8300]] },
  { brand: "Volvic", category: "water", unit: "case", variants: [["1.5L x6", 6400, 7900]] },
  { brand: "Perrier", category: "water", unit: "case", variants: [["33cl x24", 9500, 11500]] },

  // --- Juice ---
  { brand: "Ceres Juice", category: "juice", unit: "case", variants: [["1L x12", 8200, 9900]] },
  { brand: "Frutti Juice", category: "juice", unit: "case", variants: [["25cl x24", 5200, 6400]] },
  { brand: "Top Fruits", category: "juice", unit: "case", variants: [["1L x12", 6600, 8000]] },

  // --- Beer & alcohol ---
  { brand: '"33" Export', category: "beer", unit: "case", variants: [["65cl x12", 6300, 7500]] },
  { brand: "Castel Beer", category: "beer", unit: "case", variants: [["65cl x12", 6300, 7500]] },
  { brand: "Guinness", category: "beer", unit: "case", variants: [["33cl x24", 9800, 11700]] },
  { brand: "Heineken", category: "beer", unit: "case", variants: [["33cl x24", 10200, 12200]] },
  { brand: "Beaufort", category: "beer", unit: "case", variants: [["65cl x12", 6100, 7300]] },
  { brand: "Mützig", category: "beer", unit: "case", variants: [["65cl x12", 6500, 7800]] },
  { brand: "Isenbeck", category: "beer", unit: "case", variants: [["65cl x12", 6000, 7200]] },
  { brand: "Booster Energy", category: "beer", unit: "case", variants: [["33cl x24", 7200, 8800]] },
  { brand: "Smirnoff Ice", category: "beer", unit: "case", variants: [["33cl x24", 12500, 15000]] },

  // --- Hot drinks ---
  { brand: "Nescafé Classic", category: "hot_drink", unit: "carton", variants: [["100g x12", 21000, 25000], ["200g x12", 39000, 46000]] },
  { brand: "Nescafé 3in1", category: "hot_drink", unit: "carton", variants: [["sachet x24", 6800, 8300]] },
  { brand: "Nescafé Gold", category: "hot_drink", unit: "carton", variants: [["100g x6", 24000, 29000]] },
  { brand: "Milo", category: "hot_drink", unit: "carton", variants: [["400g tin x12", 33000, 39000], ["sachet x24", 6600, 8000]] },
  { brand: "Ovaltine", category: "hot_drink", unit: "carton", variants: [["400g x12", 31000, 37000]] },
  { brand: "Lipton Yellow Label", category: "hot_drink", unit: "carton", variants: [["25 bags x24", 12000, 14500]] },
  { brand: "Lipton Green Tea", category: "hot_drink", unit: "carton", variants: [["25 bags x24", 13000, 15600]] },
  { brand: "Bonnet Rouge Café", category: "hot_drink", unit: "carton", variants: [["250g x20", 16000, 19500]] },

  // --- Condiments / cooking ---
  { brand: "Maggi Cube", category: "condiment", unit: "carton", variants: [["100 cubes x30", 15000, 18000]] },
  { brand: "Maggi Arôme", category: "condiment", unit: "carton", variants: [["100ml x24", 9600, 11700]] },
  { brand: "Maggi Poulet", category: "condiment", unit: "carton", variants: [["60 cubes x24", 11000, 13300]] },
  { brand: "Knorr Cube", category: "condiment", unit: "carton", variants: [["100 cubes x30", 14500, 17500]] },
  { brand: "Jumbo Cube", category: "condiment", unit: "carton", variants: [["100 cubes x30", 13800, 16700]] },
  { brand: "Bama Mayonnaise", category: "condiment", unit: "carton", variants: [["440g x12", 12600, 15200]] },
  { brand: "Gino Tomato Paste", category: "condiment", unit: "carton", variants: [["70g x50", 9500, 11500], ["210g x24", 10800, 13000]] },
  { brand: "Salsa Tomato Paste", category: "condiment", unit: "carton", variants: [["70g x50", 9000, 11000]] },
  { brand: "Doli Mayonnaise", category: "condiment", unit: "carton", variants: [["500ml x12", 11800, 14200]] },
  { brand: "Mayor Vegetable Oil", category: "condiment", unit: "carton", variants: [["1L x12", 16800, 19500]] },
  { brand: "Diamaor Oil", category: "condiment", unit: "carton", variants: [["1L x12", 16200, 18900]] },

  // --- Dairy & spreads ---
  { brand: "Nido Milk Powder", category: "dairy", unit: "carton", variants: [["400g tin x12", 33600, 39500], ["900g tin x12", 66000, 76000]] },
  { brand: "Peak Milk", category: "dairy", unit: "carton", variants: [["400g x24", 36000, 42500]] },
  { brand: "Cowbell Milk", category: "dairy", unit: "carton", variants: [["sachet x40", 9600, 11700]] },
  { brand: "Nespray Milk", category: "dairy", unit: "carton", variants: [["400g x12", 31000, 37000]] },
  { brand: "Nutella", category: "dairy", unit: "carton", variants: [["350g x15", 27000, 32000]] },
  { brand: "St Dalfour Jam", category: "dairy", unit: "carton", variants: [["284g x12", 18000, 21600]] },

  // --- Snacks & biscuits ---
  { brand: "Pringles", category: "snack", unit: "carton", variants: [["165g x12", 15600, 18800]] },
  { brand: "Oreo", category: "snack", unit: "carton", variants: [["biscuit x24", 8400, 10200]] },
  { brand: "Ritz Crackers", category: "snack", unit: "carton", variants: [["biscuit x24", 8800, 10600]] },
  { brand: "TUC Crackers", category: "snack", unit: "carton", variants: [["100g x24", 7800, 9500]] },
  { brand: "Prince Biscuits", category: "snack", unit: "carton", variants: [["pack x24", 7200, 8800]] },
  { brand: "LU Petit Beurre", category: "snack", unit: "carton", variants: [["200g x20", 9200, 11100]] },
  { brand: "Digestive Biscuits", category: "snack", unit: "carton", variants: [["400g x12", 9600, 11600]] },

  // --- Staple foods (VAT-exempt) ---
  { brand: "Parboiled Rice", category: "staple", unit: "bag", tax: 0, variants: [["25kg", 15500, 17500], ["5kg", 3400, 3900]] },
  { brand: "Broken Rice", category: "staple", unit: "bag", tax: 0, variants: [["25kg", 13500, 15300]] },
  { brand: "Granulated Sugar", category: "staple", unit: "bag", tax: 0, variants: [["50kg", 34000, 38000], ["1kg x24", 16800, 19200]] },
  { brand: "Wheat Flour", category: "staple", unit: "bag", tax: 0, variants: [["50kg", 22000, 25000]] },
  { brand: "Panzani Spaghetti", category: "staple", unit: "carton", variants: [["500g x20", 9000, 10900]] },
  { brand: "Pasta Macaroni", category: "staple", unit: "carton", variants: [["500g x20", 7600, 9200]] },
  { brand: "Indomie Noodles", category: "staple", unit: "carton", variants: [["70g x40", 6400, 7900]] },
  { brand: "White Beans", category: "staple", unit: "bag", tax: 0, variants: [["25kg", 22000, 25000]] },
  { brand: "Garri", category: "staple", unit: "bag", tax: 0, variants: [["25kg", 12500, 14200]] },
  { brand: "Table Salt", category: "staple", unit: "carton", variants: [["500g x24", 3600, 4400]] },

  // --- Cereals ---
  { brand: "Kellogg's Corn Flakes", category: "cereal", unit: "carton", variants: [["375g x12", 21600, 25900]] },
  { brand: "Quaker Oats", category: "cereal", unit: "carton", variants: [["500g x12", 18000, 21600]] },
  { brand: "Weetabix", category: "cereal", unit: "carton", variants: [["430g x12", 19200, 23000]] },
  { brand: "Golden Morn", category: "cereal", unit: "carton", variants: [["450g x12", 14400, 17300]] },

  // --- Household cleaning ---
  { brand: "Omo Detergent", category: "household", unit: "carton", variants: [["90g x48", 12000, 14500], ["900g x12", 15600, 18700], ["3kg x6", 20400, 24500]] },
  { brand: "Ariel Detergent", category: "household", unit: "carton", variants: [["90g x48", 12600, 15200], ["900g x12", 16200, 19400]] },
  { brand: "So Klin Detergent", category: "household", unit: "carton", variants: [["900g x12", 13800, 16600]] },
  { brand: "Klin Detergent", category: "household", unit: "carton", variants: [["500g x20", 12000, 14400]] },
  { brand: "Madar Detergent", category: "household", unit: "carton", variants: [["1kg x12", 11400, 13700]] },
  { brand: "Sunlight Dishwash", category: "household", unit: "carton", variants: [["500ml x12", 9600, 11600]] },
  { brand: "Sunlight Bar Soap", category: "household", unit: "carton", variants: [["bar x36", 10800, 13000]] },
  { brand: "Eau de Javel Bleach", category: "household", unit: "carton", variants: [["1L x12", 6000, 7300]] },
  { brand: "Harpic", category: "household", unit: "carton", variants: [["500ml x12", 10800, 13000]] },
  { brand: "Vim Scourer", category: "household", unit: "carton", variants: [["500g x24", 9600, 11600]] },
  { brand: "Domestos", category: "household", unit: "carton", variants: [["750ml x12", 12000, 14400]] },
  { brand: "Airwick Freshener", category: "household", unit: "carton", variants: [["300ml x12", 13200, 15900]] },
  { brand: "Baygon Insecticide", category: "household", unit: "carton", variants: [["300ml x12", 14400, 17300]] },
  { brand: "Raid Insecticide", category: "household", unit: "carton", variants: [["400ml x12", 15600, 18700]] },
  { brand: "Mortein Coil", category: "household", unit: "carton", variants: [["10 coils x40", 8000, 9700]] },
  { brand: "Steel Wool", category: "household", unit: "carton", variants: [["pack x50", 5000, 6200]] },
  { brand: "Scouring Sponge", category: "household", unit: "carton", variants: [["pack x50", 4600, 5700]] },
  { brand: "Toilet Paper", category: "household", unit: "carton", variants: [["10 rolls x8", 12000, 14400]] },
  { brand: "Kitchen Towel", category: "household", unit: "carton", variants: [["2 rolls x12", 9600, 11600]] },
  { brand: "Garbage Bags", category: "household", unit: "carton", variants: [["50 bags x24", 7200, 8800]] },

  // --- Personal care ---
  { brand: "Colgate Toothpaste", category: "personal_care", unit: "carton", variants: [["100ml x48", 16800, 20200], ["50ml x72", 14400, 17300]] },
  { brand: "Close-Up Toothpaste", category: "personal_care", unit: "carton", variants: [["100ml x48", 15600, 18700]] },
  { brand: "Oral-B Toothbrush", category: "personal_care", unit: "carton", variants: [["brush x72", 14400, 17300]] },
  { brand: "Colgate Toothbrush", category: "personal_care", unit: "carton", variants: [["brush x72", 13200, 15900]] },
  { brand: "Dettol Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 14400, 17300]] },
  { brand: "Lux Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 12000, 14400]] },
  { brand: "Dove Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 16800, 20200]] },
  { brand: "Palmolive Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 12600, 15200]] },
  { brand: "Protex Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 13200, 15900]] },
  { brand: "Lifebuoy Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 12000, 14400]] },
  { brand: "Nivea Body Lotion", category: "personal_care", unit: "carton", variants: [["400ml x12", 21600, 25900]] },
  { brand: "Nivea Deodorant", category: "personal_care", unit: "carton", variants: [["150ml x24", 18000, 21600]] },
  { brand: "Rexona Deodorant", category: "personal_care", unit: "carton", variants: [["150ml x24", 16800, 20200]] },
  { brand: "Vaseline Petroleum Jelly", category: "personal_care", unit: "carton", variants: [["250ml x24", 14400, 17300]] },
  { brand: "Gillette Razor", category: "personal_care", unit: "carton", variants: [["5-pack x48", 12000, 14400]] },
  { brand: "Head & Shoulders Shampoo", category: "personal_care", unit: "carton", variants: [["400ml x12", 22800, 27400]] },
  { brand: "Sunsilk Shampoo", category: "personal_care", unit: "carton", variants: [["350ml x12", 15600, 18700]] },
  { brand: "Dark and Lovely", category: "personal_care", unit: "carton", variants: [["kit x12", 24000, 28800]] },
  { brand: "Always Pads", category: "personal_care", unit: "carton", variants: [["pack x24", 13200, 15900]] },
  { brand: "Kotex Pads", category: "personal_care", unit: "carton", variants: [["pack x24", 12000, 14400]] },

  // --- Baby ---
  { brand: "Pampers Diapers", category: "baby", unit: "carton", variants: [["Midi x4", 24000, 28800], ["Maxi x4", 26400, 31700], ["Junior x4", 27600, 33100]] },
  { brand: "Huggies Diapers", category: "baby", unit: "carton", variants: [["Midi x4", 23000, 27600], ["Maxi x4", 25400, 30500]] },
  { brand: "Molfix Diapers", category: "baby", unit: "carton", variants: [["Midi x6", 21600, 25900]] },
  { brand: "Johnson's Baby Powder", category: "baby", unit: "carton", variants: [["200g x24", 16800, 20200]] },
  { brand: "Johnson's Baby Shampoo", category: "baby", unit: "carton", variants: [["300ml x12", 15600, 18700]] },
  { brand: "Johnson's Baby Oil", category: "baby", unit: "carton", variants: [["200ml x12", 14400, 17300]] },
  { brand: "Cerelac", category: "baby", unit: "carton", variants: [["400g x12", 33600, 39500]] },
  { brand: "Nan Infant Formula", category: "baby", unit: "carton", tax: 0, variants: [["400g x12", 42000, 48000]] },
  { brand: "Guigoz Formula", category: "baby", unit: "carton", tax: 0, variants: [["400g x12", 39000, 45000]] },
  { brand: "Blédina Baby Food", category: "baby", unit: "carton", variants: [["jar x24", 18000, 21600]] },
  { brand: "Baby Wipes", category: "baby", unit: "carton", variants: [["120 wipes x12", 13200, 15900]] },

  // --- Extra food & beverage lines ---
  { brand: "Coca-Cola Zero", category: "soft_drink", unit: "case", variants: [["33cl x24", 4300, 5300]] },
  { brand: "Fanta Citron", category: "soft_drink", unit: "case", variants: [["33cl x24", 4200, 5200]] },
  { brand: "Vimto", category: "soft_drink", unit: "case", variants: [["33cl x24", 4600, 5700]] },
  { brand: "Djino Pamplemousse", category: "soft_drink", unit: "case", variants: [["33cl x24", 3700, 4600]] },
  { brand: "Aquabelle Water", category: "water", unit: "case", variants: [["1.5L x6", 2200, 2800]] },
  { brand: "Semme Water", category: "water", unit: "case", variants: [["1.5L x6", 2100, 2700]] },
  { brand: "Plantain Chips", category: "snack", unit: "carton", variants: [["pack x40", 6000, 7300]] },
  { brand: "Cream Crackers", category: "snack", unit: "carton", variants: [["200g x24", 7400, 9000]] },
  { brand: "Heinz Ketchup", category: "condiment", unit: "carton", variants: [["340g x12", 13200, 15900]] },
  { brand: "Maille Moutarde", category: "condiment", unit: "carton", variants: [["200g x12", 14400, 17300]] },
  { brand: "Laughing Cow Cheese", category: "dairy", unit: "carton", variants: [["8 portions x24", 15600, 18700]] },
  { brand: "Président Butter", category: "dairy", unit: "carton", variants: [["200g x24", 21600, 25900]] },
  { brand: "Nestum Cereal", category: "cereal", unit: "carton", variants: [["250g x12", 15600, 18700]] },

  // --- Extra household lines ---
  { brand: "Xtra Detergent", category: "household", unit: "carton", variants: [["900g x12", 12600, 15200]] },
  { brand: "Le Chat Detergent", category: "household", unit: "carton", variants: [["500g x20", 11400, 13700]] },
  { brand: "Savon de Marseille", category: "household", unit: "carton", variants: [["bar x36", 10200, 12300]] },
  { brand: "Sanso Multipurpose Soap", category: "household", unit: "carton", variants: [["bar x40", 9600, 11600]] },
  { brand: "Morning Fresh Dishwash", category: "household", unit: "carton", variants: [["500ml x12", 9000, 10900]] },
  { brand: "Vim Dishwash", category: "household", unit: "carton", variants: [["750ml x12", 10800, 13000]] },
  { brand: "Grésil Disinfectant", category: "household", unit: "carton", variants: [["1L x12", 8400, 10200]] },
  { brand: "Savon Noir Cleaner", category: "household", unit: "carton", variants: [["1L x12", 7200, 8800]] },
  { brand: "Glade Air Freshener", category: "household", unit: "carton", variants: [["300ml x12", 12600, 15200]] },
  { brand: "Oust Spray", category: "household", unit: "carton", variants: [["300ml x12", 13200, 15900]] },
  { brand: "Kaol Mosquito Coil", category: "household", unit: "carton", variants: [["10 coils x40", 7600, 9200]] },
  { brand: "Mobido Insecticide", category: "household", unit: "carton", variants: [["400ml x12", 14000, 16900]] },
  { brand: "Aluminium Foil", category: "household", unit: "carton", variants: [["roll x24", 8400, 10200]] },
  { brand: "Cling Film", category: "household", unit: "carton", variants: [["roll x24", 7800, 9500]] },
  { brand: "Paper Napkins", category: "household", unit: "carton", variants: [["pack x30", 6600, 8000]] },
  { brand: "Facial Tissue", category: "household", unit: "carton", variants: [["box x24", 9600, 11600]] },
  { brand: "Safety Matches", category: "household", unit: "carton", variants: [["pack x50", 4000, 5000]] },
  { brand: "Household Candles", category: "household", unit: "carton", variants: [["pack x40", 6000, 7300]] },
  { brand: "Tiger Head Batteries", category: "household", unit: "carton", variants: [["pack x60", 7200, 8800]] },
  { brand: "LED Light Bulb", category: "household", unit: "carton", variants: [["bulb x24", 14400, 17300]] },
  { brand: "Floor Mop", category: "household", unit: "carton", variants: [["mop x12", 12000, 14400]] },
  { brand: "Plastic Broom", category: "household", unit: "carton", variants: [["broom x12", 9600, 11600]] },
  { brand: "Bucket 15L", category: "household", unit: "carton", variants: [["bucket x10", 11000, 13300]] },
  { brand: "Clothes Pegs", category: "household", unit: "carton", variants: [["pack x50", 4600, 5700]] },

  // --- Extra personal care lines ---
  { brand: "Pepsodent Toothpaste", category: "personal_care", unit: "carton", variants: [["100ml x48", 14400, 17300]] },
  { brand: "Signal Toothpaste", category: "personal_care", unit: "carton", variants: [["100ml x48", 15000, 18000]] },
  { brand: "Fa Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 13200, 15900]] },
  { brand: "Camay Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 12600, 15200]] },
  { brand: "Imperial Leather Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 13800, 16700]] },
  { brand: "Geisha Soap", category: "personal_care", unit: "carton", variants: [["bar x48", 11400, 13700]] },
  { brand: "AXE Deodorant", category: "personal_care", unit: "carton", variants: [["150ml x24", 18000, 21600]] },
  { brand: "Nivea Men Cream", category: "personal_care", unit: "carton", variants: [["150ml x24", 19200, 23000]] },
  { brand: "Pantene Shampoo", category: "personal_care", unit: "carton", variants: [["400ml x12", 22800, 27400]] },
  { brand: "Sofn'free Relaxer", category: "personal_care", unit: "carton", variants: [["kit x12", 21600, 25900]] },
  { brand: "Cotton Wool", category: "personal_care", unit: "carton", variants: [["100g x24", 8400, 10200]] },
  { brand: "Cotton Buds", category: "personal_care", unit: "carton", variants: [["pack x48", 7200, 8800]] },
  { brand: "Hand Sanitizer", category: "personal_care", unit: "carton", variants: [["250ml x24", 12000, 14400]] },
  { brand: "Bic Razor", category: "personal_care", unit: "carton", variants: [["5-pack x48", 10800, 13000]] },

  // --- Extra baby lines ---
  { brand: "Fine Baby Diapers", category: "baby", unit: "carton", variants: [["Midi x6", 22000, 26400]] },
  { brand: "Molfix Maxi Diapers", category: "baby", unit: "carton", variants: [["Maxi x4", 24000, 28800]] },
  { brand: "SMA Infant Formula", category: "baby", unit: "carton", tax: 0, variants: [["400g x12", 43000, 49000]] },
  { brand: "Nestum Baby Cereal", category: "baby", unit: "carton", variants: [["250g x12", 16800, 20200]] },
  { brand: "Baby Feeding Bottle", category: "baby", unit: "carton", variants: [["bottle x24", 14400, 17300]] },
  { brand: "Baby Cologne", category: "baby", unit: "carton", variants: [["200ml x12", 13200, 15900]] },
  { brand: "Baby Lotion", category: "baby", unit: "carton", variants: [["250ml x12", 14400, 17300]] },
  { brand: "Pampers Pants", category: "baby", unit: "carton", variants: [["Junior x4", 28800, 34600]] },
];

// EAN-13 check digit so barcodes look genuine.
function ean13(base12: string): string {
  const digits = base12.split("").map(Number);
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return base12 + String(check);
}

// Expand the base products into the full flat catalog with SKUs + barcodes.
export const CATALOG: CatalogItem[] = (() => {
  const out: CatalogItem[] = [];
  let seq = 0;
  const catCode: Record<Category, string> = {
    soft_drink: "SD", water: "WA", juice: "JU", beer: "BE", hot_drink: "HD",
    condiment: "CO", dairy: "DA", snack: "SN", staple: "ST", cereal: "CE",
    household: "HH", personal_care: "PC", baby: "BB",
  };
  for (const b of BASES) {
    for (const [label, cost, price] of b.variants) {
      seq++;
      const sku = `${catCode[b.category]}-${String(seq).padStart(4, "0")}`;
      const barcode = ean13("612" + String(100000000 + seq).slice(-9));
      out.push({
        sku,
        name: `${b.brand} ${label}`,
        barcode,
        category: b.category,
        unit: b.unit,
        cost,
        price,
        tax: b.tax ?? VAT,
      });
    }
  }
  return out;
})();

export function catalogFor(categories: Category[], limit: number): CatalogItem[] {
  const pool = CATALOG.filter((c) => categories.includes(c.category));
  return pool.slice(0, limit);
}

// --- Fictional Cameroonian customer names -----------------------------------
const CITIES = [
  "Yaoundé", "Douala", "Bamenda", "Garoua", "Bafoussam", "Kribi", "Buea",
  "Limbe", "Maroua", "Ngaoundéré", "Ebolowa", "Bertoua", "Dschang", "Edéa",
  "Nkongsamba", "Kumba", "Sangmélima", "Foumban",
];
const RETAIL_TYPES = [
  "Supermarché", "Alimentation", "Épicerie", "Superette", "Boutique",
  "Mini-Marché", "Cash & Carry", "Provision Store", "Family Stores",
  "Grand Marché",
];
const QUALIFIERS = [
  "Moderne", "La Confiance", "Bon Prix", "Central", "du Peuple", "Étoile",
  "Le Progrès", "Bon Goût", "Savane", "Lumière", "Espoir", "Union", "Plus",
  "Nouvelle Vision", "Bel Air", "Harmonie", "Fraternité", "Victoire",
  "Palmier", "Baobab", "Émergence", "Avenir", "Prospérité", "Renaissance",
];

// Deterministic, unique fictional business names covering the requested mix.
export function buildCustomers(count: number): string[] {
  const names = new Set<string>();
  const push = (n: string) => names.add(n);

  // A few hand-written anchors so the list feels curated.
  [
    "Marché Moderne Yaoundé", "Douala Food Centre", "Bamenda Family Stores",
    "Nord Distribution Garoua", "Épicerie La Confiance", "Hôtel Savane Plus",
    "Pharmacie Lumière", "Restaurant Bon Goût", "Superette Le Palmier Buea",
    "Complexe Commercial Akwa", "Boulangerie Étoile du Sud",
  ].forEach(push);

  let i = 0;
  while (names.size < count) {
    const city = CITIES[i % CITIES.length];
    const roll = i % 10;
    if (roll < 5) push(`${RETAIL_TYPES[i % RETAIL_TYPES.length]} ${QUALIFIERS[i % QUALIFIERS.length]} ${city}`);
    else if (roll === 5) push(`Pharmacie ${QUALIFIERS[(i + 3) % QUALIFIERS.length]} ${city}`);
    else if (roll === 6) push(`Restaurant ${QUALIFIERS[(i + 5) % QUALIFIERS.length]} ${city}`);
    else if (roll === 7) push(`Hôtel ${QUALIFIERS[(i + 7) % QUALIFIERS.length]} ${city}`);
    else if (roll === 8) push(`Grossiste ${QUALIFIERS[(i + 2) % QUALIFIERS.length]} ${city}`);
    else push(`Auberge ${QUALIFIERS[(i + 9) % QUALIFIERS.length]} ${city}`);
    i++;
  }
  return [...names].slice(0, count);
}

// --- Fictional suppliers (local + international) ----------------------------
export type Supplier = { name: string; country: string };

export function buildSuppliers(count: number): Supplier[] {
  const local: Supplier[] = [
    { name: "Cameroon Beverages Wholesale SARL", country: "Cameroon" },
    { name: "Sawa Trading & Distribution SARL", country: "Cameroon" },
    { name: "Mont Cameroun Foods SARL", country: "Cameroon" },
    { name: "Littoral Provisions SARL", country: "Cameroon" },
    { name: "Grand Nord Commodities SARL", country: "Cameroon" },
    { name: "Océan Import SARL", country: "Cameroon" },
    { name: "Central Depot Yaoundé SARL", country: "Cameroon" },
    { name: "Akwa General Supplies SARL", country: "Cameroon" },
    { name: "Bonabéri Logistics SARL", country: "Cameroon" },
    { name: "Ouest Agro Distribution SARL", country: "Cameroon" },
    { name: "Camtrade Consumer Goods SARL", country: "Cameroon" },
    { name: "Palmeraie Wholesale SARL", country: "Cameroon" },
    { name: "Savane Distribution SARL", country: "Cameroon" },
    { name: "Douala Bulk Traders SARL", country: "Cameroon" },
    { name: "Adamaoua Provisions SARL", country: "Cameroon" },
    { name: "Cameroon Home Care Supplies SARL", country: "Cameroon" },
    { name: "Golfe de Guinée Trading SARL", country: "Cameroon" },
    { name: "Mungo River Foods SARL", country: "Cameroon" },
  ];
  const intl: Supplier[] = [
    { name: "Marseille Export Négoce", country: "France" },
    { name: "Lyon Grocery Exports", country: "France" },
    { name: "Antwerp Commodities BV", country: "Belgium" },
    { name: "Brussels FMCG Trading", country: "Belgium" },
    { name: "Rotterdam Global Foods BV", country: "Netherlands" },
    { name: "Amsterdam Consumer Exports", country: "Netherlands" },
    { name: "Dubai General Trading FZE", country: "UAE" },
    { name: "Sharjah Consumer Goods LLC", country: "UAE" },
    { name: "Istanbul Household Exports", country: "Turkey" },
    { name: "Izmir Food Trading", country: "Turkey" },
    { name: "Guangzhou Consumer Trading Co", country: "China" },
    { name: "Shenzhen Homeware Exports", country: "China" },
    { name: "Yiwu General Merchandise Co", country: "China" },
    { name: "Mumbai Exports Pvt Ltd", country: "India" },
    { name: "Delhi Personal Care Exports", country: "India" },
    { name: "Chennai Commodities Ltd", country: "India" },
    { name: "Casablanca Trading Group", country: "Morocco" },
    { name: "Alexandria Foods Export", country: "Egypt" },
    { name: "Lagos Regional Distribution Ltd", country: "Nigeria" },
    { name: "Accra Consumer Exports Ltd", country: "Ghana" },
    { name: "Abidjan Négoce International", country: "Côte d'Ivoire" },
    { name: "Lisbon Atlantic Trading", country: "Portugal" },
  ];
  const all = [...local, ...intl];
  return all.slice(0, count);
}
