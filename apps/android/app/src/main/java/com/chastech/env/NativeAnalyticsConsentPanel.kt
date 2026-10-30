package com.chastech.env

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

@Composable
fun NativeAnalyticsConsentPanel() {
    if (!BuildConfig.ANALYTICS_ENABLED) return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var choice by remember { mutableStateOf(NativeAnalytics.consentChoice(context)) }
    var expanded by remember { mutableStateOf(choice == "unset") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        NativeAnalytics.startNewSession(context)
        if (choice == "granted") NativeAnalytics.record(context, "app_opened")
        // Also retries a pending opt-out revocation after an offline session.
        runCatching { NativeAnalytics.flush(context) }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(14.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (choice == "unset" || expanded) {
                Text("Help improve enV", style = MaterialTheme.typography.titleSmall)
                Text(
                    "Optional analytics records tool activity, outcomes and approximate device and network categories. We do not collect your files, text you enter, search queries or tool output. Nothing is sent until you choose Allow.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(enabled = !busy, onClick = {
                        busy = true; error = null
                        scope.launch {
                            try {
                                NativeAnalytics.chooseConsent(context, true)
                                choice = "granted"; expanded = false
                                NativeAnalytics.record(context, "app_opened")
                                NativeAnalytics.flush(context)
                            } catch (failure: Exception) {
                                error = failure.message ?: "Your privacy preference could not be saved."
                            } finally { busy = false }
                        }
                    }) { Text(if (busy) "Saving…" else "Allow analytics") }
                    OutlinedButton(enabled = !busy, onClick = {
                        busy = true; error = null
                        scope.launch {
                            try {
                                NativeAnalytics.chooseConsent(context, false)
                                choice = "denied"; expanded = false
                            } catch (failure: Exception) {
                                error = failure.message ?: "Your privacy preference could not be saved."
                            } finally { busy = false }
                        }
                    }) { Text("No thanks") }
                    if (choice != "unset") TextButton(onClick = { expanded = false }) { Text("Close") }
                }
            } else {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(if (choice == "granted") "Analytics is enabled" else "Analytics is disabled", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { expanded = true }) { Text("Privacy choices") }
                }
            }
        }
    }
}
