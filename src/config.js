// All settings come from environment variables; see .env.example.
export function loadConfig(overrides = {}) {
  const env = process.env;
  const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
  return {
    port: num(env.PORT, 3000),
    baseUrl: env.BASE_URL || '',
    dbPath: env.DB_PATH || './data/app.db',
    uploadDir: env.UPLOAD_DIR || './data/uploads',
    // A fixed OTP for local development and tests. NEVER set this in production.
    devOtp: env.DEV_OTP || '',
    adminPhone: env.ADMIN_PHONE || '',
    // Lots whose total asking value is at or above this need an on-site inspection.
    inspectThreshold: num(env.INSPECT_THRESHOLD, 50000),
    // What an inspector earns per completed inspection, in rupees.
    inspectionFee: num(env.INSPECTION_FEE, 300),
    // Pilot model: when true, listings wait for the seller's fee before going live.
    feeRequired: env.LISTING_FEE_REQUIRED === 'true',
    listingFee: num(env.LISTING_FEE, 199),
    // Your UPI ID (e.g. surplusbuild@okaxis). When set, sellers get a "Pay with UPI" button for the fee.
    upiId: env.UPI_ID || '',
    // How long an accepted enquiry holds stock for the buyer before it is released.
    reserveDays: num(env.RESERVE_DAYS, 3),
    // Lots unsold for this many days get a "lower your price" nudge.
    priceNudgeDays: num(env.PRICE_NUDGE_DAYS, 14),

    anthropicKey: env.ANTHROPIC_API_KEY || '',
    checkModel: env.CHECK_MODEL || 'claude-sonnet-5-5',

    // Messaging. Without these, every message is only written to the outbox table.
    twilioSid: env.TWILIO_ACCOUNT_SID || '',
    twilioToken: env.TWILIO_AUTH_TOKEN || '',
    twilioFrom: env.TWILIO_FROM || '',
    whatsappToken: env.WHATSAPP_TOKEN || '',
    whatsappPhoneId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    whatsappApiVersion: env.WHATSAPP_API_VERSION || 'v21.0',

    // Requests per IP per window for form submissions.
    rateLimitMax: num(env.RATE_LIMIT_MAX, 120),
    rateLimitWindowMs: num(env.RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000),

    cookieSecure: env.COOKIE_SECURE === 'true',
    ...overrides,
  };
}

export const CATEGORIES = {
  sanitaryware: 'Sanitaryware',
  cp_fittings: 'CP fittings',
  lights: 'Lights',
  electrical: 'Switches and electrical',
  doors: 'Doors and frames',
  plywood: 'Plywood and laminates',
  office_furniture: 'Office furniture',
  tiles: 'Tiles',
  stone: 'Marble and stone',
};

// Categories where a batch / shade / lot code decides whether pieces match.
export const BATCH_REQUIRED = new Set(['tiles', 'stone']);

// Words that put a listing out of scope: they spoil with age or moisture.
export const REFUSED_WORDS = ['cement', 'paint', 'adhesive', 'putty', 'primer'];

export const GRADES = {
  A: 'A: Sealed, original packaging',
  B: 'B: Opened, unused, fully counted',
  C: 'C: Minor defects (photographed)',
  D: 'D: Salvage, sold as-is',
};

export const GRADE_HELP = {
  A: 'Unopened in the original box, with the batch or shade code visible. Inspect at pickup before loading.',
  B: 'Box opened but every piece is present, counted and never installed. Inspect at pickup before loading.',
  C: 'Usable, with defects that are photographed and priced in. No claims on listed defects.',
  D: 'Salvage, sold as-is. Check carefully before you buy.',
};

export const CITIES = ['Gurugram', 'Noida', 'Delhi', 'Faridabad', 'Ghaziabad', 'Mumbai', 'Other'];
export const UNITS = ['pcs', 'boxes', 'sq ft', 'sets', 'kg'];

export const STATUS_HELP = {
  review: 'A person is checking this lot because the automatic checks raised a question. Usually within a day.',
  awaiting_fee: 'Checks passed. The lot goes live as soon as the listing fee is received.',
  live: 'Buyers can see and enquire about this lot.',
  sold: 'Every unit has been sold.',
  rejected: 'This lot was not approved. The reason is shown below.',
  withdrawn: 'You took this lot off the marketplace.',
};
