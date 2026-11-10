package com.chastech.env

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Frosted-glass fill used by every control floating over the world. */
internal val LabGlass = Color(0x990F172A)
internal val LabGlassActive = Color(0xFF2EC4B6)

/**
 * Quiet explanation: a single tappable "i". The full sentence stays available to screen readers
 * (it is the control's accessibility label) and opens inline on tap, so panels read like a studio
 * inspector instead of a page of prose.
 */
@Composable
fun LabNote(text: String, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Column(modifier) {
        IconButton(
            onClick = { open = !open },
            modifier = Modifier.size(32.dp).semantics { contentDescription = text },
        ) {
            Icon(
                Icons.Filled.Info,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (open) {
            Text(
                text,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp).clearAndSetSemantics { },
            )
        }
    }
}

/** Round glass button for the HUD and the tool rail. */
@Composable
fun LabGlassButton(
    label: String,
    icon: ImageVector,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    active: Boolean = false,
) {
    Box(
        modifier.size(48.dp).clip(RoundedCornerShape(15.dp)).background(if (active) LabGlassActive else LabGlass)
            .pointerInput(Unit) { detectTapGestures { onClick() } }
            .semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = label
                onClick(label) { onClick(); true }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = if (active) Color(0xFF06211E) else Color.White, modifier = Modifier.size(24.dp))
    }
}

/** Press-and-hold HUD button for looking and walking; a single tap takes one step. */
@Composable
fun LabHoldButton(
    label: String,
    icon: ImageVector,
    onStep: () -> Unit,
    modifier: Modifier = Modifier,
    once: Boolean = false,
) {
    val step by rememberUpdatedState(onStep)
    Box(
        modifier.size(48.dp).clip(RoundedCornerShape(15.dp)).background(LabGlass)
            .pointerInput(once) {
                detectTapGestures(onPress = {
                    step()
                    if (!once) {
                        coroutineScope {
                            val repeat = launch {
                                delay(320)
                                while (true) {
                                    step()
                                    delay(50)
                                }
                            }
                            tryAwaitRelease()
                            repeat.cancel()
                        }
                    }
                })
            }
            .semantics(mergeDescendants = true) {
                role = Role.Button
                contentDescription = label
                onClick(label) { onStep(); true }
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
    }
}
