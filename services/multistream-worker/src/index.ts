import * as dotenv from "dotenv"; import Redis from "ioredis"; import { spawn, ChildProcessWithoutNullStreams } from "child_process"; import pino from "pino";
dotenv.config(); const log = pino({ level:"info" }); const REDIS_URL=process.env.REDIS_URL || "redis://localhost:6379/0"; const INGEST_RTMP=process.env.INGEST_RTMP || "rtmp://localhost:1935/live";
type Target={ name:string; url:string; key:string }; type Job={ creator_id:string; stream_key:string; targets:Target[] };
const redis = new Redis(REDIS_URL); const PROCS = new Map<string, ChildProcessWithoutNullStreams[]>();
function startPerTarget(input:string,t:Target){ const args=["-re","-i",input,"-c:v","copy","-c:a","aac","-f","flv",`${t.url}/${t.key}`]; const p=spawn("ffmpeg",args,{stdio:"inherit"}); return p; }
async function startJob(job:Job){ const id=`${job.creator_id}:${job.stream_key}`; if (PROCS.has(id)) return; const input = `${INGEST_RTMP}/${job.stream_key}`; const list = job.targets.map(t=>startPerTarget(input,t)); PROCS.set(id,list); list.forEach(p=>p.on("exit",()=>{})); }
async function stopJob(id:string){ const list=PROCS.get(id) || []; list.forEach(p=>p.kill("SIGTERM")); PROCS.delete(id); }
async function main(){ log.info("multistream-worker online"); while(true){ const d = await redis.blpop("multistream:jobs",0); if (!d) continue; try{ const job:Job = JSON.parse(d[1]); await startJob(job); } catch(e:any){ log.error({err:e?.message},"job failed"); } } }
main().catch((e)=>{ log.error(e); process.exit(1); });
