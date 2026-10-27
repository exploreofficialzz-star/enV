import { MusicDatasetInputError, validateMusicDatasetSaveBody } from "./music-dataset-validation.ts";
import { getSql } from "../db.ts";
import { isSameOriginRequest, jsonResponse, readJsonObject, requireBillingUser } from "../billing/http.server.ts";

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_PAGE_SIZE = 100;

type JsonRecord = Record<string, unknown>;

function apiError(error: unknown): Response {
  if (error instanceof MusicDatasetInputError) return jsonResponse({ ok: false, error: error.code, message: error.message }, error.status);
  return jsonResponse({
    ok: false,
    error: "MUSIC_DATASET_UNAVAILABLE",
    message: "The private music dataset could not be saved or loaded. No source audio was uploaded by this request; retry when the service is available.",
  }, 503);
}
async function principal(request: Request): Promise<{ userId: string } | Response> {
  if (!isSameOriginRequest(request)) return jsonResponse({ ok: false, error: "CROSS_ORIGIN_REJECTED", message: "Music dataset changes must come from the enV application." }, 403);
  const auth = await requireBillingUser(request);
  if (auth.response || !auth.userId) {
    const status = auth.response?.status ?? 401;
    return jsonResponse({
      ok: false,
      error: status === 503 ? "DATASET_AUTH_NOT_CONFIGURED" : "AUTH_REQUIRED",
      message: status === 503
        ? "Private cloud datasets are unavailable because verified account authentication is not enabled on this deployment. Local analysis and export still work."
        : "Sign in to access your private music dataset.",
    }, status);
  }
  return { userId: auth.userId };
}
export async function listMusicDatasetTracks(request: Request): Promise<Response> {
  const auth = await principal(request);
  if (auth instanceof Response) return auth;
  try {
    const url = new URL(request.url);
    const pageValue = Number(url.searchParams.get("page") ?? "1");
    const limitValue = Number(url.searchParams.get("limit") ?? "20");
    const page = Number.isSafeInteger(pageValue) && pageValue >= 1 ? Math.min(pageValue, 1_000_000) : 1;
    const limit = Number.isSafeInteger(limitValue) && limitValue >= 1 ? Math.min(limitValue, MAX_PAGE_SIZE) : 20;
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const sql = await getSql();
    const where = "t.user_id = $1 and ($2 = '' or to_tsvector('simple', t.search_text) @@ plainto_tsquery('simple', $2) or lower(t.file_name) like '%' || lower($2) || '%')";
    const [countRows, rows] = await Promise.all([
      sql.query<{ total: number }>("select count(*)::int as total from music_tracks t where " + where, [auth.userId, query]),
      sql.query<JsonRecord>(
        "select t.id,t.file_name,t.file_size_bytes,t.mime_type,t.source_sha256,t.source_sha256_verified,t.duration_seconds,t.sample_rate_hz,t.channels,t.source_metadata,t.normalized_metadata,t.rights_status,t.retention_policy,t.created_at,t.updated_at," +
        "(select count(*)::int from music_analysis_runs r where r.user_id=t.user_id and r.track_id=t.id) as analysis_run_count," +
        "(select jsonb_build_object('id',r.id,'run_number',r.run_number,'status',r.status,'analysis_schema_version',r.analysis_schema_version,'dataset_schema_version',r.dataset_schema_version,'processing_route',r.processing_route,'created_at',r.created_at,'analysis_summary',r.analysis_summary) from music_analysis_runs r where r.user_id=t.user_id and r.track_id=t.id order by r.run_number desc limit 1) as latest_run " +
        "from music_tracks t where " + where + " order by t.created_at desc,t.id desc limit $3 offset $4",
        [auth.userId, query, limit, (page - 1) * limit],
      ),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return jsonResponse({ ok: true, data: { items: rows, pagination: { page, page_size: limit, total, total_pages: Math.ceil(total / limit) } } });
  } catch (error) {
    return apiError(error);
  }
}

export async function saveMusicDatasetTrack(request: Request): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) return jsonResponse({ ok: false, error: "MUSIC_DATASET_BODY_TOO_LARGE", message: "The analysis export is larger than the 4 MiB save limit." }, 413);
  const auth = await principal(request);
  if (auth instanceof Response) return auth;
  const body = await readJsonObject(request, MAX_JSON_BYTES);
  if (!body) return jsonResponse({ ok: false, error: "MUSIC_DATASET_INVALID_JSON", message: "The save request must be valid JSON within the 4 MiB limit." }, 400);
  try {
    const input = validateMusicDatasetSaveBody(body, auth.userId);
    const sql = await getSql();
    const saved = await sql.transaction(async (tx) => {
      const previous = await tx.query<JsonRecord>(
        "select id,track_id,run_number from music_analysis_runs where user_id=$1 and idempotency_key=$2 limit 1",
        [auth.userId, input.idempotencyKey],
      );
      if (previous[0]) return { already_saved: true, track_id: previous[0].track_id, analysis_run_id: previous[0].id, run_number: previous[0].run_number, duplicate_candidates: [] as JsonRecord[] };

      const duplicates = input.sourceSha256
        ? await tx.query<JsonRecord>("select id,file_name,created_at from music_tracks where user_id=$1 and source_sha256=$2 order by created_at desc limit 20", [auth.userId, input.sourceSha256])
        : [];
      const runNumbers = await tx.query<{ next_run_number: number }>(
        "select coalesce(max(run_number),0)+1 as next_run_number from music_analysis_runs where user_id=$1 and track_id=$2",
        [auth.userId, input.trackId],
      );
      const runNumber = Number(runNumbers[0]?.next_run_number ?? 1);
      await tx.query(
        "insert into music_tracks (id,user_id,source_sha256,source_sha256_verified,file_name,file_size_bytes,mime_type,duration_seconds,sample_rate_hz,channels,source_metadata,normalized_metadata,search_text,rights_status,retention_policy) values ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,'analysis_only')",
        [input.trackId, auth.userId, input.sourceSha256, input.fileName, input.fileSize, input.mimeType, input.duration, input.sampleRate, input.channels, JSON.stringify(input.sourceMetadata), JSON.stringify(input.normalizedMetadata), input.searchText, input.rightsStatus],
      );
      await tx.query(
        "insert into music_analysis_runs (id,user_id,track_id,idempotency_key,run_number,analysis_schema_version,dataset_schema_version,engine_version,processing_route,status,source_sha256,analysis_summary,dataset_summary,warnings,result_checksum,started_at,completed_at) values ($1,$2,$3,$4,$5,$6,$7,$8,'web_local','completed',$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,now(),now())",
        [input.runId, auth.userId, input.trackId, input.idempotencyKey, runNumber, "env.music-analysis.v2", "env.music-dataset-analysis.v2", "env-music-analyzer-web-v2", input.sourceSha256, JSON.stringify(input.analysisSummary), JSON.stringify(input.datasetSummary), JSON.stringify(Array.isArray(input.dataset.warnings) ? input.dataset.warnings : []), input.resultChecksum],
      );
      if (input.frames.length) {
        await tx.query(
          "insert into music_feature_frames (user_id,analysis_run_id,frame_index,start_seconds,end_seconds,features) " +
          "select $1,$2,(item->>'frame_index')::integer,(item->>'start_seconds')::double precision,(item->>'end_seconds')::double precision,(item->'features' - 'start_seconds' - 'end_seconds') " +
          "from jsonb_array_elements($3::jsonb) as rows(item)",
          [auth.userId, input.runId, JSON.stringify(input.frames)],
        );
      }
      if (input.events.length) {
        await tx.query(
          "insert into music_analysis_events (user_id,analysis_run_id,event_type,event_index,start_seconds,end_seconds,payload) " +
          "select $1,$2,item->>'event_type',(item->>'event_index')::integer,(item->>'start_seconds')::double precision,nullif(item->>'end_seconds','')::double precision,item->'payload' " +
          "from jsonb_array_elements($3::jsonb) as rows(item)",
          [auth.userId, input.runId, JSON.stringify(input.events)],
        );
      }
      if (input.annotations.length) {
        const annotationRows = input.annotations;
        await tx.query(
          "insert into music_annotations (id,user_id,track_id,analysis_run_id,field_key,field_value,source,review_state,reviewer_id,evidence,notes) " +
          "select item->>'id',$1,$2,$3,item->>'field_key',item->'field_value',item->>'source',item->>'review_state',nullif(item->>'reviewer_id',''),item->'evidence',item->>'notes' " +
          "from jsonb_array_elements($4::jsonb) as rows(item)",
          [auth.userId, input.trackId, input.runId, JSON.stringify(annotationRows)],
        );
      }
      return { already_saved: false, track_id: input.trackId, analysis_run_id: input.runId, run_number: runNumber, duplicate_candidates: duplicates };
    });
    return jsonResponse({ ok: true, data: saved, source_audio_uploaded: false, note: "Only analysis results, metadata, feature frames and annotation history were saved. The original audio bytes were not sent to this endpoint." }, saved.already_saved ? 200 : 201);
  } catch (error) {
    return apiError(error);
  }
}

export async function deleteMusicDatasetTrack(request: Request, trackId: string): Promise<Response> {
  if (request.method !== "DELETE") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  const auth = await principal(request);
  if (auth instanceof Response) return auth;
  if (!/^[0-9a-f-]{36}$/i.test(trackId)) return jsonResponse({ ok: false, error: "INVALID_TRACK_ID", message: "The track ID is invalid." }, 400);
  try {
    const sql = await getSql();
    const rows = await sql.query<{ id: string }>("delete from music_tracks where id=$1 and user_id=$2 returning id", [trackId, auth.userId]);
    if (!rows.length) return jsonResponse({ ok: false, error: "TRACK_NOT_FOUND", message: "The track does not exist in your dataset or has already been deleted." }, 404);
    return jsonResponse({ ok: true, data: { deleted_track_id: rows[0].id, source_audio_deleted: false, cascaded_records_deleted: true }, note: "The dataset record, analysis runs, feature frames, events, collection memberships and annotations were deleted. enV did not retain the original audio bytes." });
  } catch (error) {
    return apiError(error);
  }
}


export async function getMusicDatasetTrack(request: Request, trackId: string): Promise<Response> {
  const auth = await principal(request);
  if (auth instanceof Response) return auth;
  if (!/^[0-9a-f-]{36}$/i.test(trackId)) return jsonResponse({ ok: false, error: "INVALID_TRACK_ID", message: "The track ID is invalid." }, 400);
  try {
    const sql = await getSql();
    const tracks = await sql.query<JsonRecord>(
      "select id,file_name,file_size_bytes,mime_type,source_sha256,source_sha256_verified,duration_seconds,sample_rate_hz,channels,source_metadata,normalized_metadata,rights_status,retention_policy,created_at,updated_at " +
      "from music_tracks where id=$1 and user_id=$2 limit 1",
      [trackId, auth.userId],
    );
    const track = tracks[0];
    if (!track) return jsonResponse({ ok: false, error: "TRACK_NOT_FOUND", message: "The track does not exist in your private dataset." }, 404);
    const [runs, annotations] = await Promise.all([
      sql.query<JsonRecord>(
        "select id,run_number,analysis_schema_version,dataset_schema_version,engine_version,processing_route,status,source_sha256,warnings,result_checksum,started_at,completed_at,created_at,analysis_summary,dataset_summary " +
        "from music_analysis_runs where user_id=$1 and track_id=$2 order by run_number desc limit 50",
        [auth.userId, trackId],
      ),
      sql.query<JsonRecord>(
        "select distinct on (field_key) field_key,field_value,source,review_state,reviewer_id,evidence,notes,created_at " +
        "from music_annotations where user_id=$1 and track_id=$2 order by field_key,created_at desc",
        [auth.userId, trackId],
      ),
    ]);
    return jsonResponse({ ok: true, data: { track, runs, latest_annotation_revisions: annotations, source_audio_available: false } });
  } catch (error) {
    return apiError(error);
  }
}

export async function getMusicAnalysisRun(request: Request, runId: string): Promise<Response> {
  const auth = await principal(request);
  if (auth instanceof Response) return auth;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return jsonResponse({ ok: false, error: "INVALID_ANALYSIS_RUN_ID", message: "The analysis run ID is invalid." }, 400);
  try {
    const url = new URL(request.url);
    const parseOffset = (key: string) => {
      const value = Number(url.searchParams.get(key) ?? "0");
      return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 10_000_000) : 0;
    };
    const parseLimit = (key: string) => {
      const value = Number(url.searchParams.get(key) ?? "200");
      return Number.isSafeInteger(value) && value >= 1 ? Math.min(value, 500) : 200;
    };
    const frameOffset = parseOffset("frames_offset");
    const frameLimit = parseLimit("frames_limit");
    const eventOffset = parseOffset("events_offset");
    const eventLimit = parseLimit("events_limit");
    const sql = await getSql();
    const rows = await sql.query<JsonRecord>(
      "select id,user_id,track_id,run_number,analysis_schema_version,dataset_schema_version,engine_version,processing_route,status,source_sha256,analysis_summary,dataset_summary,warnings,result_checksum,created_at " +
      "from music_analysis_runs where id=$1 and user_id=$2 limit 1",
      [runId, auth.userId],
    );
    const run = rows[0];
    if (!run) return jsonResponse({ ok: false, error: "ANALYSIS_RUN_NOT_FOUND", message: "The analysis run does not exist in your private dataset." }, 404);
    const [frameCount, frames, eventCount, events] = await Promise.all([
      sql.query<{ total: number }>("select count(*)::int as total from music_feature_frames where user_id=$1 and analysis_run_id=$2", [auth.userId, runId]),
      sql.query<JsonRecord>(
        "select frame_index,start_seconds,end_seconds,start_sample_frame,end_sample_frame,features from music_feature_frames " +
        "where user_id=$1 and analysis_run_id=$2 order by frame_index limit $3 offset $4",
        [auth.userId, runId, frameLimit, frameOffset],
      ),
      sql.query<{ total: number }>("select count(*)::int as total from music_analysis_events where user_id=$1 and analysis_run_id=$2", [auth.userId, runId]),
      sql.query<JsonRecord>(
        "select event_type,event_index,start_seconds,end_seconds,payload from music_analysis_events " +
        "where user_id=$1 and analysis_run_id=$2 order by start_seconds,event_type,event_index limit $3 offset $4",
        [auth.userId, runId, eventLimit, eventOffset],
      ),
    ]);
    return jsonResponse({
      ok: true,
      data: {
        run,
        timeline_page: { items: frames, offset: frameOffset, limit: frameLimit, total: Number(frameCount[0]?.total ?? 0), next_offset: frameOffset + frames.length < Number(frameCount[0]?.total ?? 0) ? frameOffset + frames.length : null },
        events_page: { items: events, offset: eventOffset, limit: eventLimit, total: Number(eventCount[0]?.total ?? 0), next_offset: eventOffset + events.length < Number(eventCount[0]?.total ?? 0) ? eventOffset + events.length : null },
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
