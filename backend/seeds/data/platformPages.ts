/** Events, businesses and pages seed definitions (fictional, DEMO-marked). */
export const EVENT_SEEDS = [
  { title: 'Homowo Family Durbar (DEMO EVENT)', group: 'GA', month: 8, day: 15, location: 'La Town Park, Accra', community: 'Ga', category: 'FESTIVAL' },
  { title: 'Kpokpoi Cookout & Story Night (DEMO EVENT)', group: 'GA', month: 8, day: 22, location: 'Chorkor Beach Front', community: 'Ga', category: 'FOOD' },
  { title: 'Ngmayem Thanksgiving Durbar (DEMO EVENT)', group: 'DANGME', month: 7, day: 26, location: 'Odumase-Krobo', community: 'Krobo', category: 'FESTIVAL' },
  { title: 'Asafotufiam Homecoming Gala (DEMO EVENT)', group: 'DANGME', month: 8, day: 8, location: 'Big Ada', community: 'Ada', category: 'FESTIVAL' },
  { title: 'Krobo Beads Workshop (DEMO EVENT)', group: 'DANGME', month: 6, day: 14, location: 'Somanya', community: 'Krobo', category: 'WORKSHOP' },
  { title: 'Diaspora Homecoming Meetup (DEMO EVENT)', group: 'GA', month: 12, day: 20, location: 'Osu, Accra', community: 'Ga', category: 'MEETUP' },
] as const;

export const BUSINESS_SEEDS = [
  ['Naa Dedei Kenkey Joint', 'FOOD_VENDOR', 'Hot kenkey, fried fish and fresh shito in Mamprobi. Family recipes since 1998.'],
  ['Krobo Beads & Crafts', 'ARTISAN', 'Handmade recycled glass beads from Odumase-Krobo. Custom orders welcome.'],
  ['Ada Foah Beach Tours', 'TOURISM', 'Canoe rides, island trips and estuary sunsets with local guides.'],
  ['Okailey Couture', 'FASHION', 'Modern wear with traditional Ga and Dangme patterns. Osu-based studio.'],
  ['Teshie Homowo Catering', 'CATERING', 'Full traditional menus for festivals, weddings and naming ceremonies.'],
  ['La Kpanlogo Drum School', 'EVENT_SERVICES', 'Drumming lessons and live traditional performance troupes.'],
  ['Somanya Fresh Produce', 'LOCAL_SHOP', 'Farm-direct yam, cassava and vegetables from Yilo Krobo.'],
  ['Prampram Salt & Smoke', 'FOOD_VENDOR', 'Smoked fish and sea salt processed the traditional way.'],
  ['Accra Trotro Tours', 'TRANSPORT', 'City heritage tours by local drivers who know every corner.'],
  ['Nungua Photography Studio', 'PHOTOGRAPHY', 'Festival, family and business photography with cultural flair.'],
  ['Dodowa Palm Wine Depot', 'LOCAL_SHOP', 'Fresh palm wine and traditional drinks, delivered chilled.'],
  ['Adabraka Law Chambers', 'PROFESSIONAL', 'Property and family law services by Ga-Dangme legal practitioners.'],
  ['Tema Mobile Bar Services', 'EVENT_SERVICES', 'Cocktails and traditional drinks for every occasion.'],
  ['Krobo Digital Studio', 'DIGITAL', 'Websites, branding and social media for small businesses.'],
  ['Big Ada Guest House', 'TOURISM', 'Clean riverside rooms during Asafotufiam and all year round.'],
  ['Osu Bead Boutique', 'ARTISAN', 'Krobo bead jewellery, workshops and custom designs.'],
  ['Sege Poultry Farm', 'LOCAL_SHOP', 'Healthy local birds and fresh eggs for Ada and beyond.'],
  ['Jamestown Fish Grill', 'RESTAURANT', 'Charcoal-grilled tuna, oysters and weekend highlife nights.'],
] as const;

export const PAGE_SEEDS = [
  ['GADAVIRAL Official', 'COMMUNITY', 'The official page of the Ga & Dangme online social community.'],
  ['Ga Dangme Business Directory', 'BUSINESS', 'Discover and support businesses from our communities.'],
  ['Festival Calendar GH', 'EVENTS', 'Dates, histories and guides for Ga and Dangme festivals.'],
  ['Krobo Beads Heritage', 'CULTURE', 'Celebrating and documenting the Krobo bead tradition.'],
] as const;
