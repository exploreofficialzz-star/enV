package com.chastech.env

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import kotlin.math.*

@Composable
internal fun StudioVerticalFader(label:String,value:Float,range:ClosedFloatingPointRange<Float>,selection:String,begin:()->Unit,change:(Float)->Unit) {
    val currentValue by rememberUpdatedState(value)
    val currentBegin by rememberUpdatedState(begin)
    val currentChange by rememberUpdatedState(change)
    val step=if(range.endInclusive-range.start<=1f).05f else 1f
    fun bounded(next:Float)=(range.start+((next-range.start)/step).roundToInt()*step).coerceIn(range.start,range.endInclusive)
    val fraction=((value-range.start)/(range.endInclusive-range.start).coerceAtLeast(step)).coerceIn(0f,1f)
    val ink=MaterialTheme.colorScheme.onSurface
    val track=ink.copy(alpha=.2f)
    val display=if(range.endInclusive<=1f)"${(value*100).roundToInt()}%" else value.roundToInt().toString()
    Column(Modifier.width(76.dp),horizontalAlignment=Alignment.CenterHorizontally){
        Text(label,style=MaterialTheme.typography.labelSmall,maxLines=1)
        Canvas(Modifier.size(44.dp,76.dp).semantics {
            contentDescription=label;stateDescription=display
            progressBarRangeInfo=ProgressBarRangeInfo(value.coerceIn(range.start,range.endInclusive),range)
            setProgress { currentBegin();currentChange(bounded(it));true }
        }.onKeyEvent { event ->
            val direction=when(event.key){Key.DirectionUp,Key.DirectionRight->1;Key.DirectionDown,Key.DirectionLeft->-1;else->0}
            if(direction!=0&&event.type==KeyEventType.KeyDown){if(event.nativeKeyEvent.repeatCount==0)currentBegin();currentChange(bounded(currentValue+direction*step));true}else false
        }.focusable().pointerInput(selection,range.start,range.endInclusive){
            var origin=0f;var distance=0f
            detectVerticalDragGestures(onDragStart={origin=currentValue;distance=0f;currentBegin()}){change,amount->
                change.consume();distance+=amount
                currentChange(bounded(origin-distance*(range.endInclusive-range.start)/size.height.coerceAtLeast(1)))
            }
        }){
            val top=12.dp.toPx();val bottom=size.height-top;val x=size.width/2
            val y=bottom-(bottom-top)*fraction
            drawLine(track,Offset(x,top),Offset(x,bottom),6.dp.toPx(),StrokeCap.Round)
            drawLine(ink,Offset(x,y),Offset(x,bottom),6.dp.toPx(),StrokeCap.Round)
            drawCircle(ink,12.dp.toPx(),Offset(x,y))
        }
        Text(display,style=MaterialTheme.typography.labelSmall)
    }
}

@Composable
internal fun StudioHoldButton(label:String, selection:String, begin:()->Unit, step:()->Unit) {
    val currentStep by rememberUpdatedState(step)
    val currentBegin by rememberUpdatedState(begin)
    var keyDown by remember { mutableStateOf(false) }
    Box(Modifier.size(44.dp).border(1.dp,MaterialTheme.colorScheme.outline,RoundedCornerShape(8.dp))
        .semantics { role=Role.Button; contentDescription=label; onClick { currentBegin();currentStep();true } }
        .onKeyEvent { event -> if(event.key in listOf(Key.Enter,Key.Spacebar,Key.DirectionCenter)) { if(event.type==KeyEventType.KeyDown){if(!keyDown)currentBegin();keyDown=true;currentStep()}else keyDown=false;true } else false }
        .focusable().pointerInput(selection) { detectTapGestures(onPress={
            currentBegin();currentStep()
            coroutineScope { val repeat=launch { delay(330);while(isActive){currentStep();delay(75)} };try { tryAwaitRelease() } finally { repeat.cancel() } }
        }) },contentAlignment=Alignment.Center){Text(label.substringBefore(" · "))}
}

internal object StudioImageEditor {
    data class Result(val data:String,val width:Int,val height:Int)
    fun process(source:String,operation:String,strength:Int=40,maxEdge:Int=1024):Result {
        val raw=Base64.decode(source.substringAfter(','),Base64.DEFAULT)
        val limit=if(operation=="icon")128 else maxEdge
        val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(raw,0,raw.size,bounds)
        var sample=1;while(max(bounds.outWidth,bounds.outHeight)/sample>limit*2)sample*=2
        val original=BitmapFactory.decodeByteArray(raw,0,raw.size,BitmapFactory.Options().apply{inSampleSize=sample}) ?: error("Could not decode image")
        val ratio=min(1.0,limit.toDouble()/max(original.width,original.height))
        val w=max(1,(original.width*ratio).roundToInt());val h=max(1,(original.height*ratio).roundToInt())
        val bitmap=Bitmap.createScaledBitmap(original,w,h,true).copy(Bitmap.Config.ARGB_8888,true)
        val pixels=IntArray(w*h);bitmap.getPixels(pixels,0,w,0,0,w,h)
        if(operation!="resize") {
            val border=mutableListOf<Int>();for(x in 0 until w){border.add(pixels[x]);border.add(pixels[(h-1)*w+x])};for(y in 0 until h){border.add(pixels[y*w]);border.add(pixels[y*w+w-1])}
            fun median(shift:Int)=border.filter{it ushr 24>200}.map{it ushr shift and 255}.sorted().let{it.getOrElse(it.size/2){255}}
            val r=median(16);val g=median(8);val b=median(0);val visited=BooleanArray(w*h);val queue=IntArray(w*h);var head=0;var tail=0
            fun push(i:Int){if(visited[i])return;val p=pixels[i];val d=(p ushr 16 and 255)-r;val e=(p ushr 8 and 255)-g;val f=(p and 255)-b;if(p ushr 24<8||d*d+e*e+f*f<=strength*strength){visited[i]=true;queue[tail++]=i}}
            for(x in 0 until w){push(x);push((h-1)*w+x)};for(y in 0 until h){push(y*w);push(y*w+w-1)}
            while(head<tail){val i=queue[head++];val x=i%w;val y=i/w;if(x>0)push(i-1);if(x<w-1)push(i+1);if(y>0)push(i-w);if(y<h-1)push(i+w)}
            for(i in pixels.indices)if(visited[i])pixels[i]=pixels[i] and 0x00ffffff
            bitmap.setPixels(pixels,0,w,0,0,w,h)
        }
        if(operation=="icon") {
            val path=StringBuilder();for(y in 0 until h){var x=0;while(x<w){if(pixels[y*w+x] ushr 24<96){x++;continue};val start=x;while(x<w&&pixels[y*w+x] ushr 24>=96)x++;path.append("M$start ${y}h${x-start}v1H${start}z")}}
            require(path.isNotEmpty()){ "No foreground found. Lower the strength and try again." }
            return Result("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 $w $h\"><path fill=\"currentColor\" d=\"$path\"/></svg>",w,h)
        }
        val out=ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,out)
        return Result("data:image/png;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP),w,h)
    }
}
