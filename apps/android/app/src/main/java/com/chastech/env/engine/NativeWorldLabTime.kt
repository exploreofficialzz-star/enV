package com.chastech.env.engine

private fun validateWorldLabPlayback(current:Double,elapsedSeconds:Double,rate:Double,durationSeconds:Double){
 require(current.isFinite()&&durationSeconds.isFinite()&&durationSeconds>0&&current in 0.0..durationSeconds&&
  elapsedSeconds.isFinite()&&elapsedSeconds in 0.0..60.0&&rate.isFinite()&&rate in 0.01..100.0){
  "Playback time, elapsed duration, rate or run duration is outside its supported bounds"
 }
}
private fun validWorldLabEvents(eventTimes:List<Double>,durationSeconds:Double){
 require(eventTimes.all{it.isFinite()&&it>=0.0&&it<=durationSeconds}){
  "Mandatory event times must be finite and within the recorded run"
 }
}
fun nextWorldLabEventTime(current:Double,elapsedSeconds:Double,rate:Double,durationSeconds:Double,eventTimes:List<Double>):Double{
 validateWorldLabPlayback(current,elapsedSeconds,rate,durationSeconds)
 validWorldLabEvents(eventTimes,durationSeconds)
 val candidate=(current+elapsedSeconds*rate).coerceAtMost(durationSeconds)
 val event=eventTimes.filter{it>current+1e-9&&it<=durationSeconds}.minOrNull()
 return event?.takeIf{it<candidate-1e-9}?:candidate
}
/** Move backward through recorded time and stop at the first crossed event. */
fun previousWorldLabEventTime(current:Double,elapsedSeconds:Double,rate:Double,durationSeconds:Double,eventTimes:List<Double>):Double{
 validateWorldLabPlayback(current,elapsedSeconds,rate,durationSeconds)
 validWorldLabEvents(eventTimes,durationSeconds)
 val candidate=(current-elapsedSeconds*rate).coerceAtLeast(0.0)
 val event=eventTimes.filter{it<current-1e-9&&it>candidate+1e-9}.maxOrNull()
 return event?:candidate
}
/** Direction-aware playback helper; reverse playback is for cached samples only. */
fun advanceWorldLabEventTime(current:Double,elapsedSeconds:Double,rate:Double,durationSeconds:Double,
 eventTimes:List<Double>,reverse:Boolean=false):Double =
 if(reverse)previousWorldLabEventTime(current,elapsedSeconds,rate,durationSeconds,eventTimes)
 else nextWorldLabEventTime(current,elapsedSeconds,rate,durationSeconds,eventTimes)
