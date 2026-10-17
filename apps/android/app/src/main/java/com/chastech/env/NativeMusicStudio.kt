@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.chastech.env

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.delay

private enum class NativeMusicMode(val label: String) { ARRANGEMENT("Arrangement"), EDITOR("Waveform editor"), PADS("Performance pads") }

@Composable
fun NativeMusicStudio() {
    val context = LocalContext.current
    var sourceUri by remember { mutableStateOf<Uri?>(null) }
    var sourceName by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf(NativeMusicMode.ARRANGEMENT) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var positionMs by remember { mutableLongStateOf(0L) }
    var isPlaying by remember { mutableStateOf(false) }
    var volume by remember { mutableFloatStateOf(1f) }
    var status by remember { mutableStateOf("Import a local audio source to begin.") }
    val player = remember(context) {
        ExoPlayer.Builder(context).build().apply {
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(isPlayingNow: Boolean) { isPlaying = isPlayingNow }
                override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_READY) durationMs = duration.coerceAtLeast(0L) }
            })
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        sourceUri = uri
        sourceName = uri.lastPathSegment?.substringAfterLast('/')?.takeLast(48) ?: "Imported audio"
        player.setMediaItem(MediaItem.fromUri(uri)); player.prepare(); player.volume = volume
        status = "Local source loaded. Playback and pad slices stay on this device."
    }
    LaunchedEffect(player) {
        while (true) { positionMs = player.currentPosition.coerceAtLeast(0L); delay(120) }
    }
    DisposableEffect(player) { onDispose { player.release() } }
    Column(Modifier.fillMaxSize().background(Color(0xFF080B0F)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) {
                Text("enV / AUDIO CONTROL ROOM", color = Color(0xFF67E8F9), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text("Music Studio", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text(if (sourceName.isBlank()) "Arrangement, waveform and performance workspace" else sourceName, color = Color(0xFF94A3B8), fontSize = 12.sp)
            }
            OutlinedButton(onClick = { picker.launch(arrayOf("audio/*", "video/*")) }) { Text("Import") }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            items(NativeMusicMode.entries) { item ->
                FilterChip(selected = mode == item, onClick = { mode = item }, label = { Text(item.label) })
            }
        }
        Surface(color = Color(0xFF111820), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().weight(1f)) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                when (mode) {
                    NativeMusicMode.ARRANGEMENT -> {
                        Text("ARRANGEMENT / TIMELINE", color = Color(0xFF67E8F9), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        NativeTrackRow("Original source", sourceUri != null, Color(0xFF34D399), positionMs, durationMs)
                        NativeTrackRow("Audio regions", sourceUri != null, Color(0xFF22D3EE), positionMs, durationMs)
                        Text("Native arrangement transport uses the imported source. Additional track editing and stem separation remain available in the Web Music Studio.", color = Color(0xFF94A3B8), fontSize = 12.sp)
                    }
                    NativeMusicMode.EDITOR -> {
                        Text("TRACK EDITOR", color = Color(0xFF67E8F9), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Text(sourceName.ifBlank { "No audio track selected" }, color = Color.White, style = MaterialTheme.typography.titleMedium)
                        NativeWaveformPlaceholder(hasSource = sourceUri != null, playhead = if (durationMs > 0) positionMs.toFloat() / durationMs else 0f)
                        Text("The native editor follows the real player position. Sample-level waveform analysis is kept in the browser engine where decoded PCM is available.", color = Color(0xFF94A3B8), fontSize = 12.sp)
                    }
                    NativeMusicMode.PADS -> {
                        Text("PERFORMANCE PADS", color = Color(0xFF67E8F9), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        NativePadGrid(enabled = sourceUri != null, onPad = { index ->
                            if (durationMs <= 0) { status = "Import an audio source before triggering pads."; return@NativePadGrid }
                            val slice = durationMs / 8
                            player.seekTo(slice * index); player.play(); status = "Pad ${index + 1} playing source slice ${index + 1} of 8."
                        })
                        Text("Pads retrigger real source slices with predictable seeking; quantized MIDI launching is not claimed by this native path.", color = Color(0xFF94A3B8), fontSize = 12.sp)
                    }
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Slider(value = if (durationMs > 0) positionMs.toFloat() / durationMs else 0f, onValueChange = { value -> if (durationMs > 0) player.seekTo((durationMs * value).toLong()) }, enabled = durationMs > 0, modifier = Modifier.fillMaxWidth())
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Button(onClick = { if (isPlaying) player.pause() else { if (sourceUri == null) status = "Import audio before starting transport." else player.play() } }, modifier = Modifier.height(48.dp)) { Text(if (isPlaying) "Pause" else "Play") }
                Spacer(Modifier.width(8.dp))
                OutlinedButton(onClick = { player.seekTo(0); player.pause() }, modifier = Modifier.height(48.dp)) { Text("Return to start") }
                Spacer(Modifier.weight(1f))
                Text("${formatNativeTime(positionMs)} / ${formatNativeTime(durationMs)}", color = Color(0xFFCBD5E1), fontSize = 12.sp)
            }
            Text("Volume", color = Color(0xFF94A3B8), fontSize = 11.sp)
            Slider(value = volume, onValueChange = { volume = it; player.volume = it }, valueRange = 0f..1f, modifier = Modifier.fillMaxWidth())
            Text(status, color = Color(0xFF94A3B8), fontSize = 12.sp)
        }
    }
}

@Composable
private fun NativeTrackRow(name: String, enabled: Boolean, color: Color, positionMs: Long, durationMs: Long) {
    val progress = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
    Column(Modifier.fillMaxWidth().border(1.dp, if (enabled) color.copy(alpha = .6f) else Color(0xFF334155), RoundedCornerShape(10.dp)).padding(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) { Text(name, color = if (enabled) Color.White else Color(0xFF64748B), fontWeight = FontWeight.SemiBold); Spacer(Modifier.weight(1f)); Text(if (enabled) "AUDIO" else "EMPTY", color = color, fontSize = 10.sp) }
        Box(Modifier.fillMaxWidth().height(46.dp).padding(top = 8.dp).background(color.copy(alpha = .16f), RoundedCornerShape(6.dp))) { Box(Modifier.fillMaxWidth(progress).height(46.dp).background(color.copy(alpha = .35f), RoundedCornerShape(6.dp))) }
    }
}

@Composable
private fun NativeWaveformPlaceholder(hasSource: Boolean, playhead: Float) {
    Box(Modifier.fillMaxWidth().height(190.dp).background(Color.Black, RoundedCornerShape(10.dp)).border(1.dp, Color(0xFF1E293B), RoundedCornerShape(10.dp))) {
        if (!hasSource) Text("Import audio to inspect the track", color = Color(0xFF64748B), modifier = Modifier.align(Alignment.Center))
        else {
            Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Native transport timeline", color = Color(0xFF67E8F9), fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                Text("Decoded PCM waveform inspection is available in the Web Music Studio.", color = Color(0xFF94A3B8), fontSize = 12.sp)
                Spacer(Modifier.height(14.dp))
                Box(Modifier.fillMaxWidth().height(3.dp).background(Color(0xFF1E293B), RoundedCornerShape(2.dp))) {
                    Box(Modifier.fillMaxWidth(playhead.coerceIn(0f, 1f)).height(3.dp).background(Color(0xFF34D399), RoundedCornerShape(2.dp)))
                }
            }
        }
    }
}

@Composable
private fun NativePadGrid(enabled: Boolean, onPad: (Int) -> Unit) {
    androidx.compose.foundation.layout.FlowRow(maxItemsInEachRow = 4, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        repeat(8) { index ->
            val color = listOf(Color(0xFF34D399), Color(0xFF22D3EE), Color(0xFFA78BFA), Color(0xFFFB923C))[index % 4]
            Box(Modifier.weight(1f).aspectRatio(1f).background(if (enabled) color.copy(alpha = .25f) else Color(0xFF1E293B), RoundedCornerShape(12.dp)).border(1.dp, if (enabled) color else Color(0xFF334155), RoundedCornerShape(12.dp)).clickable(enabled = enabled) { onPad(index) }, contentAlignment = Alignment.TopStart) { Text("${(index + 1).toString().padStart(2, '0')}", color = if (enabled) Color.White else Color(0xFF64748B), fontWeight = FontWeight.Bold, modifier = Modifier.padding(10.dp)) }
        }
    }
}

private fun formatNativeTime(valueMs: Long): String {
    val seconds = (valueMs / 1000).coerceAtLeast(0)
    return "%d:%02d".format(seconds / 60, seconds % 60)
}
