const DEFAULT_TIME_ZONE = "UTC";
const USER_TIME_ZONE_KEY = "delphi_time_zone";

export type ProspectTimeZoneMode = "client" | "mine";

const SINGLE_ZONE_STATE_TIME_ZONES: Record<string, string> = {
  Alabama: "America/Chicago",
  Alaska: "America/Anchorage",
  Arizona: "America/Phoenix",
  Arkansas: "America/Chicago",
  California: "America/Los_Angeles",
  Colorado: "America/Denver",
  Connecticut: "America/New_York",
  Delaware: "America/New_York",
  Georgia: "America/New_York",
  Hawaii: "Pacific/Honolulu",
  Illinois: "America/Chicago",
  Iowa: "America/Chicago",
  Louisiana: "America/Chicago",
  Maine: "America/New_York",
  Maryland: "America/New_York",
  Massachusetts: "America/New_York",
  Minnesota: "America/Chicago",
  Mississippi: "America/Chicago",
  Missouri: "America/Chicago",
  Montana: "America/Denver",
  "New Hampshire": "America/New_York",
  "New Jersey": "America/New_York",
  "New Mexico": "America/Denver",
  "New York": "America/New_York",
  "North Carolina": "America/New_York",
  Ohio: "America/New_York",
  Oklahoma: "America/Chicago",
  Pennsylvania: "America/New_York",
  "Rhode Island": "America/New_York",
  "South Carolina": "America/New_York",
  Utah: "America/Denver",
  Vermont: "America/New_York",
  Virginia: "America/New_York",
  Washington: "America/Los_Angeles",
  "West Virginia": "America/New_York",
  Wisconsin: "America/Chicago",
  Wyoming: "America/Denver",
};

const MULTI_ZONE_STATE_CITY_MATCHERS: Record<string, Array<{ zone: string; matchers: string[] }>> = {
  Alaska: [
    { zone: "America/Adak", matchers: ["adak", "atka", "aleutian"] },
  ],
  Florida: [
    {
      zone: "America/Chicago",
      matchers: [
        "pensacola",
        "panama city",
        "panama city beach",
        "destin",
        "fort walton beach",
        "crestview",
        "milton",
        "navarre",
        "gulf breeze",
        "niceville",
        "defuniak springs",
        "chipley",
        "marianna",
        "bonifay",
      ],
    },
  ],
  Idaho: [
    {
      zone: "America/Los_Angeles",
      matchers: ["coeur d'alene", "coeur d alene", "post falls", "lewiston", "moscow", "sandpoint", "hayden"],
    },
  ],
  Indiana: [
    {
      zone: "America/Chicago",
      matchers: [
        "gary",
        "hammond",
        "east chicago",
        "michigan city",
        "valparaiso",
        "la porte",
        "crown point",
        "evansville",
        "tell city",
        "petersburg",
        "mount vernon",
        "boonville",
      ],
    },
  ],
  Kentucky: [
    {
      zone: "America/Chicago",
      matchers: ["paducah", "bowling green", "owensboro", "hopkinsville", "murray", "franklin"],
    },
  ],
  Michigan: [
    {
      zone: "America/Chicago",
      matchers: ["iron mountain", "kingsford", "menominee"],
    },
  ],
  Nebraska: [
    {
      zone: "America/Denver",
      matchers: ["scottsbluff", "gering", "alliance", "sidney", "chadron", "ogallala"],
    },
  ],
  Oregon: [
    {
      zone: "America/Denver",
      matchers: ["ontario", "nyssa", "vale", "jordan valley"],
    },
  ],
  "South Dakota": [
    {
      zone: "America/Denver",
      matchers: ["rapid city", "deadwood", "spearfish", "sturgis", "lead", "custer", "hot springs"],
    },
  ],
  Tennessee: [
    {
      zone: "America/New_York",
      matchers: ["chattanooga", "knoxville", "johnson city", "cleveland", "gatlinburg", "pigeon forge", "bristol", "oak ridge", "maryville"],
    },
  ],
  Texas: [
    {
      zone: "America/Denver",
      matchers: ["el paso", "van horn"],
    },
  ],
};

const MULTI_ZONE_STATE_DEFAULTS: Record<string, string> = {
  Florida: "America/New_York",
  Idaho: "America/Boise",
  Indiana: "America/Indiana/Indianapolis",
  Kentucky: "America/New_York",
  Michigan: "America/Detroit",
  Nebraska: "America/Chicago",
  Oregon: "America/Los_Angeles",
  "South Dakota": "America/Chicago",
  Tennessee: "America/Chicago",
  Texas: "America/Chicago",
};

const TIME_ZONE_LABELS: Record<string, string> = {
  "America/New_York": "Eastern",
  "America/Chicago": "Central",
  "America/Denver": "Mountain",
  "America/Los_Angeles": "Pacific",
  "America/Phoenix": "Arizona",
  "America/Anchorage": "Alaska",
  "America/Adak": "Aleutian",
  "Pacific/Honolulu": "Hawaii",
  "America/Detroit": "Eastern",
  "America/Boise": "Mountain",
  "America/Indiana/Indianapolis": "Eastern",
};

const normalizeValue = (value: string | undefined | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");

const getTimeParts = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

const getTimeZoneOffsetMinutes = (date: Date, timeZone: string) => {
  const parts = getTimeParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUtc - date.getTime()) / 60000;
};

const wallClockToUtcDate = (dateKey: string, timeKey: string, timeZone: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const wallClockUtcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = wallClockUtcGuess - getTimeZoneOffsetMinutes(new Date(wallClockUtcGuess), timeZone) * 60000;
  utcMs = wallClockUtcGuess - getTimeZoneOffsetMinutes(new Date(utcMs), timeZone) * 60000;
  return new Date(utcMs);
};

const dateFromParts = (parts: ReturnType<typeof getTimeParts>) =>
  `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

const timeFromParts = (parts: ReturnType<typeof getTimeParts>) =>
  `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;

export const getUserTimeZone = () =>
  localStorage.getItem(USER_TIME_ZONE_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;

export const resolveClientTimeZone = (city: string | undefined | null, state: string | undefined | null) => {
  const normalizedState = String(state || "").trim();
  const normalizedCity = normalizeValue(city);

  const stateMatchers = MULTI_ZONE_STATE_CITY_MATCHERS[normalizedState];
  if (stateMatchers && normalizedCity) {
    const matched = stateMatchers.find(({ matchers }) => matchers.some((matcher) => normalizedCity.includes(matcher)));
    if (matched) return matched.zone;
  }

  if (MULTI_ZONE_STATE_DEFAULTS[normalizedState]) return MULTI_ZONE_STATE_DEFAULTS[normalizedState];
  if (SINGLE_ZONE_STATE_TIME_ZONES[normalizedState]) return SINGLE_ZONE_STATE_TIME_ZONES[normalizedState];
  return null;
};

export const getTimeZoneLabel = (timeZone: string | undefined | null) => {
  if (!timeZone) return "Unknown timezone";
  return TIME_ZONE_LABELS[timeZone] ? `${TIME_ZONE_LABELS[timeZone]} (${timeZone})` : timeZone;
};

export const convertProspectFollowUpToUserTime = (
  dateKey: string | undefined | null,
  timeKey: string | undefined | null,
  mode: ProspectTimeZoneMode | undefined | null,
  clientTimeZone: string | undefined | null,
  userTimeZone: string | undefined | null
) => {
  if (!dateKey) return { date: "", time: "", sourceTimeZone: clientTimeZone || "", targetTimeZone: userTimeZone || DEFAULT_TIME_ZONE };
  const safeUserZone = userTimeZone || DEFAULT_TIME_ZONE;
  if (!timeKey) {
    return {
      date: dateKey,
      time: "",
      sourceTimeZone: mode === "client" ? clientTimeZone || "" : safeUserZone,
      targetTimeZone: safeUserZone,
    };
  }

  if (mode !== "client" || !clientTimeZone) {
    return {
      date: dateKey,
      time: timeKey,
      sourceTimeZone: safeUserZone,
      targetTimeZone: safeUserZone,
    };
  }

  const utcDate = wallClockToUtcDate(dateKey, timeKey, clientTimeZone);
  const userParts = getTimeParts(utcDate, safeUserZone);
  return {
    date: dateFromParts(userParts),
    time: timeFromParts(userParts),
    sourceTimeZone: clientTimeZone,
    targetTimeZone: safeUserZone,
  };
};
