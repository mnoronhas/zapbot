/**
 * Google Calendar integration for ZapBot.
 *
 * Handles OAuth token management, availability calculation,
 * and appointment CRUD operations.
 */

// =============================================================================
// Types
// =============================================================================

export type CalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
};

export type AvailabilitySlot = {
  start: Date;
  end: Date;
  professional?: string;
};

export type ProfessionalConfig = {
  name: string;
  calendarId: string;
  availableDays: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  availableHours: { start: string; end: string }; // "08:00", "18:00"
};

export type AvailabilityRequest = {
  calendarId: string;
  professional: ProfessionalConfig;
  durationMinutes: number;
  bufferMinutes: number;
  fromDate: Date;
  toDate: Date;
  timezone: string;
};

export type BookingRequest = {
  calendarId: string;
  tokens: TokenPair;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  timezone: string;
};

export type BookingResult = {
  eventId: string;
  htmlLink: string;
  start: Date;
  end: Date;
};

// =============================================================================
// OAuth Helpers
// =============================================================================

export function getAuthUrl(config: CalendarConfig, state?: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent", // Force consent to always get refresh_token
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(
  config: CalendarConfig,
  code: string
): Promise<TokenPair> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Google OAuth error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(
  config: CalendarConfig,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Google token refresh error: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// =============================================================================
// Calendar Operations
// =============================================================================

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

async function calendarFetch(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Google Calendar API error ${response.status}: ${JSON.stringify(error)}`);
  }
  return response.json();
}

/** List all calendars for the authenticated user */
export async function listCalendars(
  accessToken: string
): Promise<Array<{ id: string; summary: string; primary: boolean }>> {
  const data = (await calendarFetch("/users/me/calendarList", accessToken)) as {
    items: Array<{ id: string; summary: string; primary?: boolean }>;
  };
  return data.items.map((c) => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary || false,
  }));
}

/** Get busy time ranges from a calendar */
export async function getBusySlots(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  timezone: string
): Promise<Array<{ start: Date; end: Date }>> {
  const data = (await calendarFetch("/freeBusy", accessToken, {
    method: "POST",
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: timezone,
      items: [{ id: calendarId }],
    }),
  })) as {
    calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
  };

  const busy = data.calendars[calendarId]?.busy || [];
  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

/** Book an appointment (create calendar event) */
export async function createEvent(req: BookingRequest): Promise<BookingResult> {
  const event = {
    summary: req.summary,
    description: req.description,
    start: {
      dateTime: req.startTime.toISOString(),
      timeZone: req.timezone,
    },
    end: {
      dateTime: req.endTime.toISOString(),
      timeZone: req.timezone,
    },
    ...(req.attendeeEmail
      ? { attendees: [{ email: req.attendeeEmail }] }
      : {}),
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 60 }],
    },
  };

  const data = (await calendarFetch(
    `/calendars/${encodeURIComponent(req.calendarId)}/events`,
    req.tokens.accessToken,
    { method: "POST", body: JSON.stringify(event) }
  )) as { id: string; htmlLink: string; start: { dateTime: string }; end: { dateTime: string } };

  return {
    eventId: data.id,
    htmlLink: data.htmlLink,
    start: new Date(data.start.dateTime),
    end: new Date(data.end.dateTime),
  };
}

/** Cancel an appointment (delete calendar event) */
export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete event: ${response.status}`);
  }
}

// =============================================================================
// Availability Calculator
// =============================================================================

/**
 * Calculate available appointment slots.
 *
 * Algorithm:
 * 1. Generate all possible slots based on professional's schedule
 * 2. Fetch busy times from Google Calendar
 * 3. Subtract busy times from possible slots
 * 4. Return available slots
 */
export async function calculateAvailability(
  accessToken: string,
  req: AvailabilityRequest
): Promise<AvailabilitySlot[]> {
  // 1. Generate all possible slots
  const possibleSlots = generatePossibleSlots(
    req.professional,
    req.durationMinutes,
    req.bufferMinutes,
    req.fromDate,
    req.toDate,
    req.timezone
  );

  // 2. Get busy times from Google Calendar
  const busySlots = await getBusySlots(
    accessToken,
    req.calendarId,
    req.fromDate,
    req.toDate,
    req.timezone
  );

  // 3. Filter out slots that overlap with busy times
  const available = possibleSlots.filter((slot) => {
    const slotEndWithBuffer = new Date(slot.end.getTime() + req.bufferMinutes * 60_000);
    return !busySlots.some(
      (busy) => slot.start < busy.end && slotEndWithBuffer > busy.start
    );
  });

  return available.map((s) => ({
    ...s,
    professional: req.professional.name,
  }));
}

/**
 * Generate all theoretically possible time slots for a professional.
 */
function generatePossibleSlots(
  professional: ProfessionalConfig,
  durationMinutes: number,
  bufferMinutes: number,
  fromDate: Date,
  toDate: Date,
  timezone: string
): Array<{ start: Date; end: Date }> {
  const slots: Array<{ start: Date; end: Date }> = [];
  const [startHour, startMin] = professional.availableHours.start.split(":").map(Number);
  const [endHour, endMin] = professional.availableHours.end.split(":").map(Number);

  const current = new Date(fromDate);
  current.setHours(0, 0, 0, 0);

  while (current <= toDate) {
    const dayOfWeek = current.getDay();

    if (professional.availableDays.includes(dayOfWeek)) {
      // Generate slots for this day
      const dayStart = new Date(current);
      dayStart.setHours(startHour, startMin, 0, 0);

      const dayEnd = new Date(current);
      dayEnd.setHours(endHour, endMin, 0, 0);

      let slotStart = new Date(dayStart);

      while (slotStart.getTime() + durationMinutes * 60_000 <= dayEnd.getTime()) {
        // Skip past slots
        if (slotStart > fromDate) {
          const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
          slots.push({ start: new Date(slotStart), end: slotEnd });
        }
        // Move to next slot (duration + buffer)
        slotStart = new Date(slotStart.getTime() + (durationMinutes + bufferMinutes) * 60_000);
      }
    }

    // Next day
    current.setDate(current.getDate() + 1);
  }

  return slots;
}
