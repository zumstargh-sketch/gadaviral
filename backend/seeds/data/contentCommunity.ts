/** Church, jobs/marketplace, travel and announcement caption pools. */
const pick = <T,>(arr: readonly T[], i: number): T => arr[i % arr.length];

export const CHURCH = [
  'Harvest thanksgiving this Sunday. Come with a grateful heart and your dancing shoes.',
  'Our choir is preparing special songs for the anniversary. The harmonies are something else.',
  'Community cleanup after service today. Faith with work clothes on.',
  'Youth service was packed today. The future of the church looks bright.',
  'Remembering the founders of our congregation this month. Their sacrifice built what we enjoy.',
] as const;

export const JOBS = [
  'Job alert: a restaurant near Spintex is hiring cooks with traditional food experience. Share with someone who needs it.',
  'Selling: fairly used deep freezer, clean condition. Pickup in Tema. Serious buyers only.',
  'We are looking for a part-time tailor in Adabraka. Flexible hours, fair pay.',
  'Vacancy: shop attendant, Accra central. Basic salary plus commission. Apply with CV.',
  'Service available: transport for events and airport pickups. Reliable, clean bus, fair price.',
  'Anyone needing a wedding photographer? My calendar has two openings this month. Portfolio on request.',
  'Market women of our area: microloans scheme applications are open at the assembly office this week.',
] as const;

export const TRAVEL = [
  'Weekend trip to the coast done right: sea breeze, fresh fish, and stories from the elders.',
  'Took the family to the Shai Hills this holiday. The kids did not want to come back.',
  'Our lagoons and beaches need protection. Carry your rubbish home after every outing.',
  'Visited a bead market this weekend. The craftsmanship passes from mother to daughter. Respect.',
  'Road trip through our traditional areas planned for next month. Suggest stops with good food!',
  'The view from the hills at sunrise explains why our ancestors chose this land. Breathtaking.',
] as const;

export const ANNOUNCE = [
  'ANNOUNCEMENT: Community dues for the youth development fund are due by month end. Pay to the treasurer.',
  'Reminder: the family meeting holds this Sunday at the compound. Attendance matters.',
  'Blood donation drive at the community centre this Saturday, 9am. Save a life.',
  'Registration for the free holiday classes opens Monday. Limited spaces. First come, first served.',
  'The community library now opens on Saturdays too. Bring the children.',
] as const;

export const TEST_POSTS = [
  'Testing a new GADAVIRAL feature. If you can see this, the feed works!',
  'Testing image uploads on GADAVIRAL today. One, two, checking.',
  'Testing comments — please reply with any emoji so I can count them.',
  'Testing reactions. React with whatever expresses your mood right now.',
  'Testing sharing. Share this post to your profile if sharing works.',
  'Testing polls! Vote below so I can verify the counter.',
  'Testing notifications. If you got a bell from this post, say so.',
  'Feedback time: what should we improve on the new feed?',
] as const;

export const genChurch = (i: number) => pick(CHURCH, i);
export const genJobs = (i: number) => pick(JOBS, i);
export const genTravel = (i: number) => pick(TRAVEL, i);
export const genAnnounce = (i: number) => pick(ANNOUNCE, i);
export const genTest = (i: number) => pick(TEST_POSTS, i);
