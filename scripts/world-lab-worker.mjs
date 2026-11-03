#!/usr/bin/env node
/** Run in a dedicated private worker with PostgreSQL, not an HTTP handler. */
if(!process.env.DATABASE_URL||process.env.WORLD_LAB_JOBS_ENABLED!=="true"){
  console.error("[world-lab-worker] Durable job service is disabled.");
  process.exitCode=1;
}else{
  const {processOneWorldLabJob,purgeExpiredWorldLabJobs,assertWorldLabWorkerReady}=
    await import("../src/lib/world-lab/jobs.server.ts");
  const once=process.argv.includes("--once");
  try{
    await assertWorldLabWorkerReady();
  }catch(error){
    console.error("[world-lab-worker] Deployment is not ready:",
      error instanceof Error?error.message:"Unknown startup error");
    process.exit(1);
  }
  let running=true;
  const stop=()=>{running=false;};
  process.on("SIGTERM",stop);process.on("SIGINT",stop);
  let lastCleanup=0;
  while(running){
    try{
      // On startup and at six-hour intervals, prune expired private inputs
      // in bounded batches. Jobs remain tenant-scoped until deleted.
      if(Date.now()-lastCleanup>=6*60*60*1000){
        for(let batch=0;batch<10;batch++){
          const removed=await purgeExpiredWorldLabJobs();
          if(removed<200)break;
        }
        lastCleanup=Date.now();
      }
      const processed=await processOneWorldLabJob();
      if(once)break;
      if(!processed)await new Promise(resolve=>setTimeout(resolve,1500));
    }catch(error){
      console.error("[world-lab-worker] Controlled job failed:",
        error instanceof Error?error.name:"UnknownError");
      if(once){process.exitCode=1;break;}
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
  }
}
