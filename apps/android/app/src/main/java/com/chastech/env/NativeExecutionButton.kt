package com.chastech.env

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * Runs a native action only after the shared native authorization policy succeeds.
 * Used by specialized native screens that do not render the generic Run/Reset row.
 */
@Composable
internal fun NativeExecutionButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onAuthorized: () -> Unit,
) {
    val telemetry = LocalNativeToolExecutionTelemetry.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var authorizing by remember { mutableStateOf(false) }
    var accessState by remember { mutableStateOf<NativeToolAuthorization?>(null) }

    fun openAccountPath(path: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://envtools.store/$path")))
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Button(
            modifier = modifier,
            enabled = enabled && !authorizing,
            onClick = {
                if (telemetry == null) {
                    onAuthorized()
                    return@Button
                }
                scope.launch {
                    authorizing = true
                    val authorization = telemetry.authorizeRun()
                    authorizing = false
                    if (authorization == NativeToolAuthorization.ALLOWED) {
                        accessState = null
                        telemetry.start()
                        onAuthorized()
                    } else {
                        accessState = authorization
                    }
                }
            },
        ) {
            Text(if (authorizing) "…" else text)
        }
        when (accessState) {
            NativeToolAuthorization.SIGN_IN_REQUIRED -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { openAccountPath("login") }) { Text("Sign in") }
                Button(onClick = { openAccountPath("signup") }) { Text("Create account") }
            }
            NativeToolAuthorization.INSUFFICIENT_CREDITS -> Button(onClick = { openAccountPath("wallet") }) { Text("Buy enV") }
            NativeToolAuthorization.RETRY -> OutlinedButton(onClick = { accessState = null }) { Text("Retry") }
            else -> Unit
        }
    }
}
