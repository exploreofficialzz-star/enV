package com.chastech.env.engine
fun nextWorldLabEventTime(current:Double,elapsedSeconds:Double,rate:Double,durationSeconds:Double,eventTimes:List<Double>):Double{
 require(current.isFinite()&&durationSeconds.isFinite()&&durationSeconds>0&&current in 0.0..durationSeconds&&elapsedSeconds.isFinite()&&elapsedSeconds in 0.0..60.0&&rate.isFinite()&&rate in 0.01..100.0)
 val candidate=(current+elapsedSeconds*rate).coerceAtMost(durationSeconds)
 val event=eventTimes.filter{it.isFinite()&&it>current+1e-9&&it<=durationSeconds}.minOrNull()
 return event?.takeIf{it<candidate-1e-9}?:candidate
}