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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.foundation.isSystemInDarkTheme
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
    val dark = isSystemInDarkTheme()
    val ink = if (dark) Color.White else Color.Black
    val canvas = if (dark) Color.Black else Color.White
    val chrome = if (dark) Color(0xFF0A0C10) else Color(0xFFF4F4F5)
    val muted = if (dark) Color(0xFF94A3B8) else Color(0xFF64748B)
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
    Column(Modifier.fillMaxSize().background(canvas)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().background(chrome).padding(horizontal = 10.dp, vertical = 8.dp)) {
            Text("↩", color = ink, fontSize = 24.sp, modifier = Modifier.padding(horizontal = 8.dp).clickable { mode = NativeMusicMode.ARRANGEMENT })
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f).background(if (dark) Color(0xFF1B2029) else Color(0xFFE4E4E7), RoundedCornerShape(24.dp)).padding(4.dp)) {
                NativeToolButton("▥", mode == NativeMusicMode.ARRANGEMENT) { mode = NativeMusicMode.ARRANGEMENT }
                NativeToolButton("♩", mode == NativeMusicMode.EDITOR) { mode = NativeMusicMode.EDITOR }
                NativeToolButton("⚙", mode == NativeMusicMode.PADS) { mode = NativeMusicMode.PADS }
            }
            Text("☁", color = ink, fontSize = 22.sp, modifier = Modifier.padding(horizontal = 8.dp).clickable { status = "Project state remains local on this device." })
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().background(chrome).padding(horizontal = 10.dp, vertical = 6.dp)) {
            Text("${formatNativeTime(positionMs)}", color = muted, fontSize = 11.sp); Spacer(Modifier.weight(1f)); Text("${formatNativeTime(durationMs)}", color = muted, fontSize = 11.sp)
        }
        Box(Modifier.weight(1f).fillMaxWidth().background(canvas)) {
            Column(Modifier.fillMaxSize().verticalScroll(androidx.compose.foundation.rememberScrollState())) {
                Row(Modifier.fillMaxWidth().background(chrome).padding(8.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text("TRACKS", color = Color(0xFF64748B), fontSize = 10.sp); Text("TIMELINE / BARS", color = Color(0xFF64748B), fontSize = 10.sp) }
                if (mode == NativeMusicMode.ARRANGEMENT) {
                    val names = listOf("Lead Vox", "Background Vox", "Track 3", "Keys", "Lead", "Drums", "Strings")
                    val colors = listOf(Color(0xFF10B981), Color(0xFFEF4444), Color(0xFFA855F7), Color(0xFF3B82F6), Color(0xFFEC4899), Color(0xFFF97316), Color(0xFF22D3EE))
                    names.forEachIndexed { index, name -> NativeTrackRow(name, sourceUri != null, colors[index], positionMs, durationMs) }
                } else if (mode == NativeMusicMode.EDITOR) {
                    Text("VOICE / AUDIO", color = Color(0xFF34D399), fontWeight = FontWeight.Bold, modifier = Modifier.padding(12.dp))
                    NativeWaveformPlaceholder(hasSource = sourceUri != null, playhead = if (durationMs > 0) positionMs.toFloat() / durationMs else 0f)
                } else {
                    NativePadGrid(enabled = sourceUri != null, onPad = { index -> if (durationMs <= 0) status = "Import an audio source before triggering pads." else { player.seekTo((durationMs / 8) * index); player.play(); status = "Pad ${index + 1} playing source slice ${index + 1} of 8." } })
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().background(chrome).padding(horizontal = 10.dp, vertical = 9.dp)) {
            Text("＋", color = ink, fontSize = 28.sp, modifier = Modifier.clickable { picker.launch(arrayOf("audio/*", "video/*")) })
            Text("↶", color = ink, fontSize = 24.sp); Text("|◀", color = ink, fontSize = 20.sp)
            Button(onClick = { if (isPlaying) player.pause() else { if (sourceUri == null) status = "Import audio before starting transport." else player.play() } }, modifier = Modifier.size(58.dp), shape = androidx.compose.foundation.shape.CircleShape, colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Color(0xFFEF2D1A))) { Text(if (isPlaying) "Ⅱ" else "●", fontSize = 20.sp) }
            Text("▶", color = ink, fontSize = 24.sp); Text("↷", color = ink, fontSize = 24.sp); Spacer(Modifier.weight(1f)); Text("☷", color = ink, fontSize = 22.sp); Text("♩", color = ink, fontSize = 22.sp)
        }
        Slider(value = if (durationMs > 0) positionMs.toFloat() / durationMs else 0f, onValueChange = { value -> if (durationMs > 0) player.seekTo((durationMs * value).toLong()) }, enabled = durationMs > 0, modifier = Modifier.fillMaxWidth().background(chrome).padding(horizontal = 10.dp))
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().background(chrome).padding(10.dp)) { Text(sourceName.ifBlank { "No source loaded" }, color = muted, fontSize = 11.sp); Spacer(Modifier.weight(1f)); Text(status, color = muted, fontSize = 11.sp) }
    }
}

@Composable
private fun NativeToolButton(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(Modifier.size(36.dp).background(if (selected) Color.White else Color.Transparent, RoundedCornerShape(18.dp)).clickable { onClick() }, contentAlignment = Alignment.Center) { Text(label, color = if (selected) Color.Black else Color.White, fontSize = 16.sp) }
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
