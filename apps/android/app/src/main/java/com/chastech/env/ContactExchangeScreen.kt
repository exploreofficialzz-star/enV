package com.chastech.env

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

@Composable
fun ContactExchangeScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val controller = remember { ContactExchangeController(context) }
    var fullName by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var company by rememberSaveable { mutableStateOf("") }
    var jobTitle by rememberSaveable { mutableStateOf("") }
    var website by rememberSaveable { mutableStateOf("") }
    var tick by remember { mutableIntStateOf(0) }
    var pendingSave by remember { mutableStateOf<ContactExchangeController.Received?>(null) }
    val transportLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        if (result.values.all { it }) controller.start(ContactExchangeController.Card(fullName, phone, email, company, jobTitle, website))
        else controller.error = "Nearby permissions were denied. Exchange remains off."
        tick++
    }
    val contactsLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val item = pendingSave
        pendingSave = null
        if (granted && item != null) controller.saveContact(item).onFailure { controller.error = it.message }
        tick++
    }
    DisposableEffect(controller) {
        controller.onChanged = { tick++ }
        onDispose { controller.onChanged = null; controller.stop() }
    }
    @Suppress("UNUSED_VARIABLE") val ignored = tick
    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text("Back") }
                Text("Instant Contact Exchange", style = MaterialTheme.typography.titleLarge)
            }
        }
        item {
            Text("Both people must activate Exchange. Only the fields below are sent to participants discovered after activation.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item { ContactField("Full name", fullName) { fullName = it } }
        item { ContactField("Phone", phone) { phone = it } }
        item { ContactField("Email", email) { email = it } }
        item { ContactField("Company", company) { company = it } }
        item { ContactField("Job title", jobTitle) { jobTitle = it } }
        item { ContactField("Website", website) { website = it } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = {
                    val missing = controller.requiredPermissions().filter { context.checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
                    if (missing.isNotEmpty()) transportLauncher.launch(missing.toTypedArray())
                    else controller.start(ContactExchangeController.Card(fullName, phone, email, company, jobTitle, website))
                }) { Text(if (controller.active) "Exchange active" else "Activate Exchange") }
                if (controller.active) OutlinedButton(onClick = { controller.stop(); tick++ }) { Text("Stop") }
            }
        }
        if (controller.active) item { Text("Active · ${controller.connectedParticipants.size} nearby participant(s) connected", color = MaterialTheme.colorScheme.primary) }
        controller.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
        if (controller.received.isNotEmpty()) item { HorizontalDivider(); Text("Received contacts", style = MaterialTheme.typography.titleMedium) }
        itemsIndexed(controller.received) { _, item ->
            Card {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(item.card.fullName.ifBlank { "Unnamed contact" }, style = MaterialTheme.typography.titleMedium)
                    listOf(item.card.phone, item.card.email, item.card.company, item.card.jobTitle, item.card.website).filter { it.isNotBlank() }.forEach { Text(it) }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = {
                            if (controller.hasContactWritePermission()) controller.saveContact(item).onFailure { controller.error = it.message }
                            else { pendingSave = item; contactsLauncher.launch(Manifest.permission.WRITE_CONTACTS) }
                            tick++
                        }) { Text("Save to Contacts") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ContactField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(value = value, onValueChange = onValueChange, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
}
