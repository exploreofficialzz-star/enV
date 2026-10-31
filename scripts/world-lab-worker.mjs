#!/usr/bin/env node
/** Run in a dedicated private worker with PostgreSQL, not an HTTP handler. */
if(!process.env.DATABASE_URL||process.env.WORLD_LAB_JOBS_ENABLED!=="true"){
  console.error("[world-lab-worker] Durable job service is disabled.");
  process.exitCode=1;
}else{
  const {processOneWorldLabJob}=await import("../src/lib/world-lab/jobs.server.ts");
  const once=process.argv.includes("--once");
  let running=true;
  const stop=()=>{running=false;};
  process.on("SIGTERM",stop);process.on("SIGINT",stop);
  while(running){
    try{
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
