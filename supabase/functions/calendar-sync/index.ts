import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

type SyncAction = 'upsert' | 'delete'

type SyncRequestBody = {
  action: SyncAction
  bookingId: string
  booking?: {
    googleEventId?: string
    google_event_id?: string
  }
}

type BookingRow = {
  id: string
  title: string | null
  user_name: string
  assigned_cars: string[]
  start_datetime: string
  end_datetime: string
  note: string | null
  status: 'active' | 'overridden'
  google_event_id: string | null
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3'
const DEFAULT_CALENDAR_ID = '50046b4f55c49e5b441c929189bbac30cf6369339355b41b912fe48d1326145c@group.calendar.google.com'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function normalizePrivateKey(rawPrivateKey: string): string {
  let value = rawPrivateKey.trim()

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }

  // Support multiple secret formatting styles that often happen in terminals.
  value = value
    .replace(/\\\\r\\\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')

  return value
}

async function createServiceAccountAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`

  const normalizedPrivateKey = normalizePrivateKey(privateKey)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(normalizedPrivateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  )

  const assertion = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text()
    throw new Error(`Google OAuth token exchange failed: ${body}`)
  }

  const tokenJson = await tokenResponse.json()
  return tokenJson.access_token
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')
  const binary = atob(pemContents)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function assignedCarsLabel(assignedCars: string[]): string {
  const hasWhite = assignedCars.includes('white')
  const hasRed = assignedCars.includes('red')
  if (hasWhite && hasRed) {
    return 'Both cars'
  }
  if (hasWhite) {
    return 'White car'
  }
  if (hasRed) {
    return 'Red car'
  }
  return 'Car'
}

function strikethroughText(value: string): string {
  return value.split('').map((char) => `${char}\u0336`).join('')
}

function buildDescription(booking: BookingRow): string {
  const lines: string[] = []
  const cleanTitle = (booking.title ?? '').trim()
  const cleanNote = (booking.note ?? '').trim()

  if (cleanTitle) {
    lines.push(`Title: ${cleanTitle}`)
  }
  if (cleanNote) {
    lines.push(`Note: ${cleanNote}`)
  }
  if (booking.status === 'overridden') {
    lines.push('Status: Overridden')
  }
  lines.push('Created via Family Car Scheduler')
  lines.push(`Booking ID: ${booking.id}`)

  return lines.join('\n')
}

function buildGoogleEventPayload(booking: BookingRow) {
  const cleanTitle = (booking.title ?? '').trim()
  const baseSummary = `${booking.user_name} - ${assignedCarsLabel(booking.assigned_cars)}`
  const activeSummary = cleanTitle ? `${baseSummary} | ${cleanTitle}` : baseSummary
  const summary = booking.status === 'overridden'
    ? strikethroughText(activeSummary)
    : activeSummary
  return {
    summary,
    description: buildDescription(booking),
    start: { dateTime: booking.start_datetime },
    end: { dateTime: booking.end_datetime },
    extendedProperties: {
      private: {
        booking_id: booking.id,
      },
    },
  }
}

function calendarEventIdFromBookingId(bookingId: string): string {
  // Google event IDs allow chars a-v and digits 0-9. Strip UUID separators.
  const normalized = bookingId.toLowerCase().replace(/-/g, '')
  return `bk${normalized}`
}

async function googleRequest(accessToken: string, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${GOOGLE_CALENDAR_BASE_URL}${path}`, {
    ...init,
    headers,
  })
}

function compactError(input: unknown): string {
  const message = input instanceof Error ? input.message : String(input)
  return message.length > 900 ? `${message.slice(0, 900)}...` : message
}

async function findGoogleEventByBookingId(
  accessToken: string,
  calendarId: string,
  bookingId: string,
): Promise<{ id: string } | null> {
  const listResponse = await googleRequest(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?maxResults=5&singleEvents=true&showDeleted=true&privateExtendedProperty=${encodeURIComponent(`booking_id=${bookingId}`)}`,
    { method: 'GET' },
  )

  if (!listResponse.ok) {
    throw new Error(await listResponse.text())
  }

  const listJson = await listResponse.json()
  const items = (listJson.items ?? []) as Array<{ id?: string }>
  const firstWithId = items.find((item) => Boolean(item.id))
  return firstWithId?.id ? { id: firstWithId.id } : null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const googleServiceAccountEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    const googleServiceAccountPrivateKey = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
    const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID') ?? DEFAULT_CALENDAR_ID

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }
    if (!googleServiceAccountEmail || !googleServiceAccountPrivateKey) {
      throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)
    const body = (await request.json()) as SyncRequestBody
    const action = body.action
    const bookingId = body.bookingId

    if (!bookingId || (action !== 'upsert' && action !== 'delete')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid sync payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const accessToken = await createServiceAccountAccessToken(googleServiceAccountEmail, googleServiceAccountPrivateKey)

    if (action === 'upsert') {
      const { data: bookingData, error: bookingError } = await supabaseAdmin
        .from('bookings')
        .select('id,title,user_name,assigned_cars,start_datetime,end_datetime,note,status,google_event_id')
        .eq('id', bookingId)
        .maybeSingle()

      if (bookingError) {
        throw bookingError
      }
      if (!bookingData) {
        return new Response(
          JSON.stringify({ success: false, error: `Booking ${bookingId} not found` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const booking = bookingData as BookingRow
      const eventPayload = buildGoogleEventPayload(booking)

      try {
        let googleEventId = booking.google_event_id
        const deterministicEventId = calendarEventIdFromBookingId(booking.id)

        if (!googleEventId) {
          const existing = await findGoogleEventByBookingId(accessToken, calendarId, booking.id)
          googleEventId = existing?.id ?? null
        }

        if (!googleEventId) {
          const createResponse = await googleRequest(
            accessToken,
            `/calendars/${encodeURIComponent(calendarId)}/events`,
            { method: 'POST', body: JSON.stringify({ ...eventPayload, id: deterministicEventId }) },
          )

          if (createResponse.status === 409) {
            googleEventId = deterministicEventId
          } else if (!createResponse.ok) {
            throw new Error(await createResponse.text())
          } else {
            const createdEvent = await createResponse.json()
            googleEventId = createdEvent.id
          }
        } else {
          const updateResponse = await googleRequest(
            accessToken,
            `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
            { method: 'PATCH', body: JSON.stringify(eventPayload) },
          )

          if (updateResponse.status === 404) {
            const recreateResponse = await googleRequest(
              accessToken,
              `/calendars/${encodeURIComponent(calendarId)}/events`,
              { method: 'POST', body: JSON.stringify({ ...eventPayload, id: deterministicEventId }) },
            )
            if (recreateResponse.status === 409) {
              googleEventId = deterministicEventId
            } else if (!recreateResponse.ok) {
              throw new Error(await recreateResponse.text())
            } else {
              const recreatedEvent = await recreateResponse.json()
              googleEventId = recreatedEvent.id
            }
          } else if (!updateResponse.ok) {
            throw new Error(await updateResponse.text())
          }
        }

        const { error: updateSyncError } = await supabaseAdmin
          .from('bookings')
          .update({
            google_event_id: googleEventId,
            calendar_sync_status: 'synced',
            calendar_last_synced_at: new Date().toISOString(),
            calendar_sync_error: null,
          })
          .eq('id', bookingId)

        if (updateSyncError) {
          throw updateSyncError
        }

        return new Response(
          JSON.stringify({ success: true, action, bookingId, googleEventId }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      } catch (syncError) {
        const syncErrorMessage = compactError(syncError)
        await supabaseAdmin
          .from('bookings')
          .update({
            calendar_sync_status: 'failed',
            calendar_sync_error: syncErrorMessage,
          })
          .eq('id', bookingId)

        return new Response(
          JSON.stringify({ success: false, action, bookingId, error: syncErrorMessage }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    const deleteSnapshot = body.booking
    let googleEventId = deleteSnapshot?.googleEventId ?? deleteSnapshot?.google_event_id ?? null

    if (!googleEventId) {
      const { data: existingBooking, error: existingBookingError } = await supabaseAdmin
        .from('bookings')
        .select('google_event_id')
        .eq('id', bookingId)
        .maybeSingle()
      if (existingBookingError) {
        throw existingBookingError
      }
      googleEventId = (existingBooking as { google_event_id?: string | null } | null)?.google_event_id ?? null
    }

    try {
      if (googleEventId) {
        const deleteResponse = await googleRequest(
          accessToken,
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
          { method: 'DELETE' },
        )

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          throw new Error(await deleteResponse.text())
        }
      }

      return new Response(
        JSON.stringify({ success: true, action, bookingId }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } catch (syncError) {
      const syncErrorMessage = compactError(syncError)
      await supabaseAdmin
        .from('bookings')
        .update({
          calendar_sync_status: 'failed',
          calendar_sync_error: syncErrorMessage,
        })
        .eq('id', bookingId)

      return new Response(
        JSON.stringify({ success: false, action, bookingId, error: syncErrorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: compactError(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
