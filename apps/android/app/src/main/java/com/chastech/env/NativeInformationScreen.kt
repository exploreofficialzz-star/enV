package com.chastech.env

import com.chastech.env.ui.CharacterSpacedText as Text

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import com.chastech.env.billing.OfflineWalletJournal
import com.chastech.env.billing.OfflineWalletNativeApi
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.chastech.env.ui.ChasTechnologiesLogo
import com.chastech.env.ui.EnVIcon

@Composable
fun NativeInformationScreen(pageId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val title = when (pageId) {
        "about" -> "About enV"
        "help" -> "Help center"
        "tokens" -> "Token guide"
        "wallet" -> "Wallet"
        "pricing" -> "Pricing"
        "contact" -> "Contact"
        "account" -> "Account"
        "history" -> "History"
        "privacy" -> "Privacy"
        "terms" -> "Terms of Use"
        "disclaimer" -> "Disclaimer"
        "responsible-use" -> "Responsible Use"
        else -> "About enV"
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 40.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.fillMaxWidth().widthIn(max = 768.dp).align(Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = "Back" }) {
                    EnVIcon("ArrowLeft", tint = MaterialTheme.colorScheme.onSurface)
                }
                Text(title, style = MaterialTheme.typography.headlineMedium.copy(fontSize = 30.sp), fontWeight = FontWeight.Normal)
            }

            when (pageId) {
                "about" -> AboutInformation()
                "help" -> InformationSection("enV Help Center", listOf("Browse the tool catalog or use Search tools to find an action by name or task.", "Open a tool to see its required inputs, permissions, and available outputs. Some tools work entirely on-device; AI and hosted processors require a configured connection.", "For account, access, or product questions, use Contact from More options."))
                "tokens" -> InformationSection("Understanding tokens", listOf("Token usage depends on the tool and the work being performed.", "Local utilities may use different rules from hosted AI, media processing, and multi-step workflows.", "Review relevant tool information and Wallet activity when evaluating token usage."))
                "pricing" -> PricingInformation()
                "contact" -> ContactInformation()
                "account" -> Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    InformationSection("Welcome back to enV", listOf("Sign in or create an account from the enV sign-in page."))
                    Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://envtools.store/account"))) }, modifier = Modifier.fillMaxWidth()) { Text("Continue to sign in") }
                }
                "wallet" -> NativeWalletDashboard()
                "history" -> InformationSection("", listOf("Recently used tools will appear here."))
                "privacy" -> PrivacyInformation()
                "terms" -> TermsInformation()
                "disclaimer" -> DisclaimerInformation()
                "responsible-use" -> ResponsibleUseInformation()
                else -> AboutInformation()
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun NativeWalletDashboard() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var paired by remember { mutableStateOf(OfflineWalletNativeApi.isPaired(context)) }
    var dashboard by remember { mutableStateOf<OfflineWalletNativeApi.WalletDashboard?>(null) }
    var code by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var refresh by remember { mutableStateOf(0) }
    var message by remember { mutableStateOf("") }
    var errorState by remember { mutableStateOf(false) }

    LaunchedEffect(refresh, paired) {
        if (!paired) { dashboard = null; return@LaunchedEffect }
        loading = true
        try {
            dashboard = OfflineWalletNativeApi.fetchWalletDashboard(context)
            message = ""
            errorState = false
        } catch (error: Exception) {
            dashboard = null
            message = error.message ?: "The shared wallet could not be loaded."
            errorState = true
        } finally { loading = false }
    }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (dashboard == null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            ) {
                Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Connect your enV wallet", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Normal)
                    Text("Sign in on the enV website, open Wallet and generate a one-time code in the Connect Android/iOS section. Enter the code here to securely view your shared balance, rewards and history.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://envtools.store/wallet"))) }, modifier = Modifier.fillMaxWidth()) { Text("Open enV web Wallet") }
                    OutlinedTextField(value = code, onValueChange = { code = it }, modifier = Modifier.fillMaxWidth(), label = { Text("One-time pairing code") }, singleLine = true, enabled = !busy)
                    Button(onClick = {
                        scope.launch {
                            busy = true
                            try {
                                val result = OfflineWalletNativeApi.pair(context, code)
                                if (!result.ok) throw IllegalStateException(result.message)
                                code = ""
                                paired = true
                                refresh += 1
                                message = "This Android device is paired."
                                errorState = false
                            } catch (error: Exception) {
                                message = error.message ?: "The device could not be paired."
                                errorState = true
                            } finally { busy = false }
                        }
                    }, enabled = !busy && code.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                        Text(if (busy) "Connecting…" else "Pair this Android device")
                    }
                }
            }
        } else if (dashboard != null) {
            val data = dashboard!!
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            ) {
                Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Available to use", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${data.availableTokens.formatWalletTokens()} tokens", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Normal)
                    Text("Illustrative reference value: ${(data.availableTokens * 0.01).formatWalletTokens()} USD. This is not cash or a guaranteed redemption value.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { message = "In-app funding is not enabled for this Android build. Google Play Billing and server-side purchase verification must be configured before payments can be taken." }, modifier = Modifier.fillMaxWidth()) { Text("Funding setup") }
                    Text("Fund wallet is unavailable until this app has verified Google Play Billing products.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NativeWalletMetric("Total deposited", data.lifetimePurchasedTokens.formatWalletTokens(), "Verified purchases", Modifier.weight(1f))
                NativeWalletMetric("Total remaining", data.availableTokens.formatWalletTokens(), "Available now", Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NativeWalletMetric("Total used", data.lifetimeConsumedTokens.formatWalletTokens(), "Recorded usage", Modifier.weight(1f))
                NativeWalletMetric("Reserved", data.reservedTokens.formatWalletTokens(), "Held for active work", Modifier.weight(1f))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                NativeWalletMetric("Referral rewards", data.referralTokens.formatWalletTokens(), "Qualified invites", Modifier.weight(1f))
                NativeWalletMetric("Affiliate rewards", data.affiliateTokens.formatWalletTokens(), "Verified video conversions", Modifier.weight(1f))
                NativeWalletMetric("Bonus tokens", data.bonusTokens.formatWalletTokens(), "Promotional awards", Modifier.weight(1f))
            }
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            ) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Invite friends", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal)
                    Text("${data.referralCount} invites · ${data.qualifiedReferrals} qualified · ${data.totalRewardTokens.formatWalletTokens()} reward tokens", style = MaterialTheme.typography.bodyMedium)
                    Text("https://envtools.store/signup?ref=${data.referralCode}", style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = {
                        val link = "https://envtools.store/signup?ref=${data.referralCode}"
                        val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, "Join me on enV: $link") }
                        context.startActivity(Intent.createChooser(send, "Share your enV invite"))
                    }, modifier = Modifier.fillMaxWidth()) { Text("Share invite link") }
                    Text("Video affiliate · ${data.videoConversions} verified conversions", style = MaterialTheme.typography.titleSmall)
                    Text("https://envtools.store/signup?ref=${data.referralCode}&source=video&sig=${data.videoSignature}", style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = {
                        val link = "https://envtools.store/signup?ref=${data.referralCode}&source=video&sig=${data.videoSignature}"
                        val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, "Discover enV: $link") }
                        context.startActivity(Intent.createChooser(send, "Share your enV video link"))
                    }, modifier = Modifier.fillMaxWidth()) { Text("Share video link") }
                    Text("Rewards follow verified purchase conversions, not self-reported views.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
            ) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("Recent activity", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal)
                        Spacer(Modifier.weight(1f))
                        TextButton(onClick = { refresh += 1 }) { Text("Refresh") }
                    }
                    if (data.activity.isEmpty()) {
                        Text("No wallet activity has been recorded yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        data.activity.take(12).forEach { row ->
                            Column(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(row.description.ifBlank { row.type.replaceFirstChar { it.uppercase() } }, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Normal)
                                Text(row.type, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(row.createdAt, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            OutlinedButton(onClick = { paired = false; code = ""; message = "" }, modifier = Modifier.fillMaxWidth()) { Text("Reconnect or pair another session") }
        }
        if (loading) Text("Loading your shared wallet…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.bodyMedium, color = if (errorState) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun NativeWalletMetric(title: String, value: String, subtitle: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Normal)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun Double.formatWalletTokens(): String =
    java.text.NumberFormat.getNumberInstance().apply { maximumFractionDigits = 3 }.format(this)

@Composable
private fun OfflineWalletPairingPanel() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val journal = remember { OfflineWalletJournal(context) }
    var code by remember { mutableStateOf("") }
    var enabled by remember { mutableStateOf(false) }
    var availabilityCode by remember { mutableStateOf("") }
    var showFinalizeConfirmation by remember { mutableStateOf(false) }
    var availabilityMessage by remember { mutableStateOf("Checking offline-wallet availability…") }
    var paired by remember { mutableStateOf(OfflineWalletNativeApi.isPaired(context)) }
    var busy by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf("") }
    var activeAllowanceId by remember { mutableStateOf(runCatching { journal.activeAllowanceId() }.getOrNull()) }

    LaunchedEffect(Unit) {
        val state = OfflineWalletNativeApi.checkAvailability()
        enabled = state.ok
        availabilityCode = state.code.orEmpty()
        availabilityMessage = state.message
        paired = OfflineWalletNativeApi.isPaired(context)
        activeAllowanceId = runCatching { journal.activeAllowanceId() }.getOrNull()
    }

    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Offline token wallet", style = MaterialTheme.typography.titleMedium)
            Text(availabilityMessage, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!enabled) {
                Text("An offline allowance is unavailable right now. Local tools can still be used where supported without an allowance.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(if (paired) "This device has a secure paired session." else "To connect: open enV web → Wallet → Offline token allowance → Generate one-time code.", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(value = code, onValueChange = { code = it.trim().take(80) }, enabled = !busy && !paired,
                    label = { Text("One-time pairing code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Button(onClick = { scope.launch {
                    busy = true; feedback = ""
                    try { val result = OfflineWalletNativeApi.pair(context, code); paired = true; code = ""; feedback = result.message }
                    catch (failure: Throwable) { feedback = failure.message ?: "Pairing could not be completed." }
                    finally { busy = false }
                } }, enabled = enabled && !busy && !paired && code.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                    Text(if (busy) "Connecting…" else "Pair this Android device")
                }
                if (paired) {
                    Text("Paired. The native signing key stays in Android Keystore. Losing the app's data can make unsynchronized usage unrecoverable.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = { scope.launch {
                        busy = true; feedback = ""
                        try { val result = OfflineWalletNativeApi.reserveAllowance(context, journal); activeAllowanceId = journal.activeAllowanceId(); feedback = result.message }
                        catch (failure: Throwable) { feedback = failure.message ?: "The allowance was not reserved." }
                        finally { busy = false }
                    } }, enabled = !busy && activeAllowanceId == null, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Reserving…" else "Reserve 5 tokens for this device") }
                    activeAllowanceId?.let { allowanceId ->
                        Text("An offline allowance is active on this device.", style = MaterialTheme.typography.bodySmall)
                        Button(onClick = { scope.launch {
                            busy = true; feedback = ""
                            try { val result = OfflineWalletNativeApi.synchronize(context, journal, allowanceId); feedback = result.message; activeAllowanceId = journal.activeAllowanceId() }
                            catch (failure: Throwable) { feedback = failure.message ?: "Synchronization failed; local records were preserved." }
                            finally { busy = false }
                        } }, enabled = !busy && journal.pendingTransactionCount(allowanceId) > 0, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "Synchronizing…" else "Synchronize pending calculator records") }
                        if (availabilityCode == "LOCAL_TEST_ONLY") {
                            OutlinedButton(onClick = { showFinalizeConfirmation = true }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text("Close allowance") }
                        }
                    }
                }
            }
            if (showFinalizeConfirmation) {
                AlertDialog(onDismissRequest = { showFinalizeConfirmation = false },
                    title = { Text("Close allowance?") },
                    text = { Text("This closes the active allowance, sends a final checkpoint, and settles the recorded usage according to the wallet ledger.") },
                    confirmButton = { TextButton(onClick = {
                        showFinalizeConfirmation = false
                        val allowanceId = activeAllowanceId ?: return@TextButton
                        scope.launch {
                            busy = true; feedback = ""
                            try { val result = OfflineWalletNativeApi.synchronize(context, journal, allowanceId, finalize = true); feedback = result.message; activeAllowanceId = journal.activeAllowanceId() }
                            catch (failure: Throwable) { feedback = failure.message ?: "Finalization failed; reserved funds remain protected." }
                            finally { busy = false }
                        }
                    }) { Text("Finalize test allowance") } },
                    dismissButton = { TextButton(onClick = { showFinalizeConfirmation = false }) { Text("Cancel") } })
            }
            if (feedback.isNotBlank()) Text(feedback, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AboutInformation() {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Surface(
            modifier = Modifier.widthIn(max = 520.dp).fillMaxWidth().align(Alignment.CenterHorizontally),
            color = Color.White,
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            ChasTechnologiesLogo(Modifier.fillMaxWidth().aspectRatio(3.2f))
        }
        InformationSection("A focused toolkit for everyday work", listOf(
            "enV brings practical utilities together in one place across Web, Android, and iOS. Browse by category, search for a tool, and use the tools that fit your task.",
            "enV is developed and operated by chAs Technologies LLC, a company registered in Delaware, USA. Some tools process information on your device; features that need a server or an external provider make that clear in their use and are described in our Privacy page.",
        ), titleSize = 20.sp)
        CompanyContactCard()
    }
}

@Composable
private fun CompanyContactCard() {
    val context = LocalContext.current
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = informationSurface2()), shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Company", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.onSurface)
            Text("chAs Technologies LLC", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            EmailAction("envtoolkit@gmail.com", context, "Product inquiries:")
            EmailAction("chastechnologiesllc@gmail.com", context, "Company inquiries:")
        }
    }
}

@Composable
private fun ContactInformation() {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        InformationSection("", listOf("Choose the address that best matches your inquiry. We will use your message to respond to the request you send."))
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            if (maxWidth >= 640.dp) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    ContactCard("enV product support", "Questions, feedback, accessibility concerns, or help using the toolkit.", showProductSupport = true, modifier = Modifier.weight(1f))
                    ContactCard("Company inquiries", "Business, partnership, and company-related correspondence for chAs Technologies LLC.", showCompanyAddress = true, modifier = Modifier.weight(1f))
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    ContactCard("enV product support", "Questions, feedback, accessibility concerns, or help using the toolkit.", showProductSupport = true)
                    ContactCard("Company inquiries", "Business, partnership, and company-related correspondence for chAs Technologies LLC.", showCompanyAddress = true)
                }
            }
        }
        Text("Please do not include passwords, payment-card details, or other highly sensitive information in ordinary email.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ContactCard(title: String, description: String, showProductSupport: Boolean = false, showCompanyAddress: Boolean = false, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = informationSurface2()),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.onSurface)
            Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (showProductSupport) EmailAction("envtoolkit@gmail.com", context)
            if (showCompanyAddress) EmailAction("chastechnologiesllc@gmail.com", context)
        }
    }
}

@Composable
private fun EmailAction(address: String, context: android.content.Context, label: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (label != null) Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        TextButton(onClick = {
            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$address"))
            if (intent.resolveActivity(context.packageManager) != null) context.startActivity(intent)
            else Toast.makeText(context, "No email app is available. Copy this address: $address", Toast.LENGTH_LONG).show()
        }) { Text(address, textDecoration = TextDecoration.Underline) }
    }
}

@Composable
private fun PricingInformation() {
    val surface2 = informationSurface2()
    val context = LocalContext.current
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Card(
            colors = CardDefaults.cardColors(containerColor = surface2),
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    EnVIcon("ShieldCheck", tint = MaterialTheme.colorScheme.primary)
                    Text("No advertising", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal)
                }
                Text("enV uses token accounting to explain usage across local tools, cloud processing, media, and AI workflows. Metered work should show its applicable rate, usage estimate, and limits before you start.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Token conversion reference", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal)
                Text("100 tokens ≈ $1.00 USD", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.onSurface)
                Text("Wallet accounting uses integer milli-tokens, allowing fractional-token amounts without floating-point rounding errors.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Any payment must show the applicable currency, total, terms, and provider details before confirmation.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Prices are listed in USD for reference. Before any purchase, the final currency and total will be shown.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        InformationSection("How usage is measured", listOf(
            "Local utilities: operation-specific rules for calculations, text tools, and conversions.",
            "Cloud and media tools: usage factors include file size, pages, duration, resolution, processing resources, and provider cost.",
            "AI Agent workflows: budgets account for model usage, underlying tool calls, and bounded retries.",
            "Premium capabilities: access rules are explained before selection, and metered work is reflected in usage records.",
        ))
        InformationSection("Offline usage and recovery", listOf(
            "Offline allowances require a supported device session. Local tools can continue to work where they support on-device processing.",
            "Eligible operations should be recorded locally and reconciled with the shared wallet after reconnecting.",
            "Keep unsynchronized records until the server confirms receipt. If local records are lost, report them through the wallet recovery flow instead of assuming the allowance was unused.",
        ))
        InformationSection("One wallet, clear records", listOf(
            "The wallet organizes balances, reservations, and activity into an auditable ledger across supported enV experiences.",
            "Token expiry, refunds, and purchase terms should be stated clearly before a purchase and applied consistently with local law and platform rules.",
            "Supported payment methods, currencies, taxes, and minimum top-ups should be displayed before payment confirmation.",
        ))
        Card(
            colors = CardDefaults.cardColors(containerColor = surface2),
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        ) {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Before a metered operation", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal)
                Text("Review the applicable rate, usage estimate, maximum budget, and provider details before starting metered work. Usage may vary with input size, duration, output, retries, and provider fees.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Button(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://en-v.vercel.app/wallet"))) }, modifier = Modifier.fillMaxWidth()) { Text("Open Wallet") }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Questions about enV pricing can be sent to", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            EmailAction("envtoolkit@gmail.com", LocalContext.current)
        }
    }
}

@Composable
private fun PrivacyInformation() {
    InformationSection("", listOf("chAs Technologies LLC, a company registered in Delaware, USA, develops and operates enV. This notice describes the information handled by the enV Web, Android, and iOS experiences and how feature-specific processing works."))
    InformationSection("Age requirement", listOf("enV is for people aged 13 or older and is not intended for children under 13. If you are under the age of majority where you live, any parent or guardian permission required by your local law still applies. Contact us if you believe a child under 13 has provided personal information through enV."))
    InformationSection("A local-first toolkit—with some connected features", listOf(
        "Many tools run directly on your device. When a tool needs a server, an AI model, or a media processor, information needed for that operation is sent to the enV service or the processor configured for that feature. Tool screens should be treated as the guide to whether a task is local or connected.",
        "Do not submit passwords, payment-card details, confidential business material, or sensitive personal information to a connected tool unless you have reviewed the relevant provider and are comfortable with its handling.",
    ))
    InformationSection("Information stored on your device", listOf(
        "Depending on the platform and features you use, enV stores preferences such as theme, saved tools, recently opened tools, and per-tool usage counts for personal shortcuts on your device. The Web version uses browser storage for these preferences. The Web Contact Exchange tool also stores the contact-card fields and selected sharing fields you enter in that browser. This information remains until you clear the relevant browser or app data.",
        "Native Contact Exchange does not upload a profile to an enV account. When you deliberately activate Exchange, the fields shown in that feature are sent to nearby participating devices. Saving a received contact to your address book requires your separate action and the platform’s Contacts permission.",
    ))
    InformationSection("Connected tools and service providers", bullets = listOf(
        "Documents and media: some tools upload the files you select to an enV processing endpoint or to a media processor configured for the deployment. The document endpoint uses a temporary working directory and removes it after the request finishes. Other processor or infrastructure retention depends on that service’s configuration and policies.",
        "AI features: when enabled, the task input needed to produce a response is sent through the enV server to the AI provider configured for that deployment. The code supports Groq, OpenRouter, and Google Gemini; the provider used can vary by task and server configuration. AI results may be cached briefly when caching is enabled. Provider handling and retention are governed in part by the provider’s terms and privacy practices.",
        "Sign-in: an account is not required for ordinary toolkit use. If sign-in is enabled for a deployment and you choose to use it, the identity provider and configured database process account and session information such as your email and profile details. Authentication uses session cookies.",
        "Operational infrastructure: hosting, network, and service providers may process connection and diagnostic data needed to deliver, secure, and troubleshoot the service.",
    ), afterBullets = listOf("Provider availability, settings, and retention can change by deployment. enV does not promise that an external provider will retain or delete submitted content on a particular schedule. Review the provider information shown for the feature before sending information you consider sensitive."))
    InformationSection("Cookies, sessions, and account requests", listOf(
        "Browser-local preferences use local storage. If an optional sign-in or AI feature is used, the service may set essential session cookies—for example, to maintain sign-in or apply abuse-prevention limits. These are not the same as a marketing-cookie profile.",
        "If you have used a sign-in-enabled deployment and want to ask about, correct, or delete account information, email envtoolkit@gmail.com. Information stored only on your device can generally be removed by clearing that browser’s site data or the app’s local data.",
    ))
    InformationSection("Payments and tokens", listOf("Token accounting uses a ledger for balances, reservations, and recorded usage. Before a payment is confirmed, checkout should present the price, provider, applicable taxes, refund terms, and purchase verification details. enV does not collect payment-card details directly through the toolkit."))
    InformationSection("Changes and contact", listOf(
        "We may revise this notice when product features, providers, or data practices change. The published version should be checked before using connected features.",
        "For privacy questions or requests, contact envtoolkit@gmail.com. Company correspondence may also be sent to chastechnologiesllc@gmail.com.",
    ))
}

@Composable
private fun TermsInformation() {
    InformationSection("", listOf("These Terms apply when you use enV on the Web, Android, or iOS. enV is developed and operated by chAs Technologies LLC. By using the service, you agree to use it lawfully and in accordance with these Terms and the Responsible Use policy."))
    InformationSection("Eligibility", listOf("You must be at least 13 years old to use enV. If you are under the age of majority where you live, use enV only with any parent or guardian permission required by local law and follow any applicable local restrictions."))
    InformationSection("Governing Law and Venue", listOf("These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict-of-law principles. Subject to non-waivable consumer rights and mandatory laws that apply where you live, disputes arising from or relating to these Terms will be brought in the state or federal courts located in Delaware, and the parties consent to those courts’ jurisdiction and venue. Nothing in this section limits a right or remedy that cannot lawfully be waived."))
    InformationSection("Using enV", listOf(
        "enV provides practical tools, calculators, generators, converters, and optional connected features. You are responsible for the information you submit, the permissions you grant, and how you use any output. Do not use enV in a way that violates law, another person’s rights, or a third-party service’s terms.",
        "Some features work on your device; others may require a network connection or send the information needed for the task to enV’s configured service providers. Availability and capabilities may differ by platform and deployment.",
    ))
    InformationSection("Accounts and contact exchange", listOf("An account is not required for ordinary toolkit use. Where sign-in is enabled, you are responsible for protecting access to your account and for activity under it. Contact Exchange is optional: when you activate it, selected contact fields are shared with nearby participants. You are responsible for choosing what to share and for having permission to share it."))
    InformationSection("Your content and tool results", listOf(
        "You must have the necessary rights and permissions for any text, files, images, contact details, or other material you submit. Outputs may be incomplete, inaccurate, unsuitable for your purpose, or similar to outputs received by other users. Review and independently verify results before using, publishing, or acting on them.",
        "Do not rely on enV as a substitute for qualified legal, medical, financial, tax, safety, or other professional advice. See the Disclaimer for more detail.",
    ))
    InformationSection("Availability and changes", listOf("We may update, suspend, or discontinue a tool or feature to maintain, improve, or protect enV. We do not guarantee that the service will be uninterrupted, error-free, compatible with every device, or available in every location. Third-party features are also subject to the availability and terms of their providers."))
    InformationSection("Tokens and pricing", listOf("The Pricing page explains the reference conversion and factors that may affect token usage. Any purchase offer must show the actual price, currency, taxes, payment method, refund terms, and expiry rules before confirmation."))
    InformationSection("Disclaimer and limits", listOf("To the extent permitted by applicable law, enV is provided “as is” and “as available,” without warranties that cannot be disclaimed under that law. To the extent permitted by applicable law, chAs Technologies LLC is not responsible for indirect or consequential losses arising from use of the service. Nothing in these Terms excludes a right or liability that cannot lawfully be excluded."))
    InformationSection("Questions", listOf("For questions about these Terms, contact envtoolkit@gmail.com or chastechnologiesllc@gmail.com."))
}

@Composable
private fun DisclaimerInformation() {
    InformationSection("", listOf("enV is a general-purpose toolkit developed by chAs Technologies LLC. It is provided for convenience and informational use; it is not a substitute for professional judgment or advice."))
    InformationSection("Verify every result", listOf("Calculations, conversions, generated text, extracted data, and other results can be incomplete, inaccurate, outdated, or affected by the information you provide. Check inputs, assumptions, units, and outputs against reliable sources before relying on them or sharing them with others."))
    InformationSection("Not professional advice", listOf("enV does not provide legal, medical, mental-health, financial, investment, tax, accounting, engineering, or safety-critical advice. Do not use a tool result as the sole basis for a decision that could affect someone’s health, rights, finances, safety, or legal obligations. Consult a qualified professional when appropriate."))
    InformationSection("AI and third-party services", listOf("AI-generated content may be wrong, biased, incomplete, or unsuitable. It may not be unique and may require human review. Connected features may depend on third-party providers, whose outputs, availability, and policies are outside enV’s control. Review the Privacy and Terms pages before sending sensitive information to a connected feature."))
    InformationSection("No guarantee", listOf("enV and its results are provided without a guarantee of fitness for a particular purpose or error-free operation, except for rights that cannot be limited under applicable law. You are responsible for deciding whether a tool and its result are appropriate for your situation."))
}

@Composable
private fun ResponsibleUseInformation() {
    InformationSection("", listOf(
        "Use enV lawfully, respectfully, and with appropriate human judgment. These rules apply to every platform and to content created, transformed, analyzed, or shared through the service.",
        "enV is for people aged 13 or older. If you are under the age of majority where you live, follow any local parent or guardian permission requirements that apply to you.",
    ))
    InformationSection("Do not use enV to", bullets = listOf(
        "break the law, facilitate fraud, or infringe another person’s copyright, privacy, or other rights;",
        "harass, threaten, exploit, impersonate, deceive, or target people without their consent;",
        "create or distribute malware, credentials-stealing material, spam, or instructions intended to cause harm;",
        "share someone else’s contact details or personal information without a lawful basis and appropriate permission;",
        "bypass security, access systems or data without authorization, or disrupt enV or third-party services; or",
        "treat a generated or calculated result as verified professional advice or as the sole basis for a high-stakes decision.",
    ))
    InformationSection("Your responsibilities", listOf(
        "Only submit material you are allowed to use. Review connected-tool notices before sending text or files to a server or AI provider. In Contact Exchange, activate sharing only when you intend to exchange information and enable only fields you are comfortable sending to nearby participants.",
        "Keep a human in control: review outputs, verify important facts, and use qualified professionals for legal, medical, financial, tax, and safety-critical matters.",
    ))
    InformationSection("Reporting a concern", listOf("If you believe enV is being used unlawfully or encounter a safety or privacy issue, contact envtoolkit@gmail.com. Company-related correspondence may be sent to chastechnologiesllc@gmail.com."))
}

@Composable
private fun InformationCardSection(title: String, paragraphs: List<String>) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color.Transparent), shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.onSurface)
            paragraphs.forEachIndexed { index, paragraph ->
                val labelEnd = paragraph.indexOf(':')
                if (index < 2 && labelEnd > 0) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                        Text(paragraph.substring(0, labelEnd + 1), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(paragraph.substring(labelEnd + 1), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    Text(paragraph, style = if (index == 2) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun InformationSection(title: String, paragraphs: List<String> = emptyList(), bullets: List<String> = emptyList(), afterBullets: List<String> = emptyList(), titleSize: TextUnit = 18.sp) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (title.isNotBlank()) Text(title, style = MaterialTheme.typography.titleMedium, fontSize = titleSize, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.onSurface)
        paragraphs.forEach { InformationParagraph(it) }
        bullets.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                Surface(Modifier.padding(top = 9.dp).size(5.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, shape = CircleShape) {}
                val labelEnd = item.indexOf(':')
                if (labelEnd > 0) {
                    Text(item.substring(0, labelEnd + 1), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(item.substring(labelEnd + 1), modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Text(item, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        afterBullets.forEach { InformationParagraph(it) }
    }
}

@Composable
private fun InformationParagraph(text: String) {
    val context = LocalContext.current
    val emails = Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
    val color = MaterialTheme.colorScheme.primary
    val annotated = buildAnnotatedString {
        var cursor = 0
        for (match in emails.findAll(text)) {
            append(text.substring(cursor, match.range.first))
            pushStringAnnotation(tag = "mailto", annotation = match.value)
            withStyle(SpanStyle(color = color, textDecoration = TextDecoration.Underline)) { append(match.value) }
            pop()
            cursor = match.range.last + 1
        }
        append(text.substring(cursor))
    }
    ClickableText(
        text = annotated,
        style = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 0.02.em),
        onClick = { offset ->
            annotated.getStringAnnotations("mailto", offset, offset).firstOrNull()?.let { annotation ->
                val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:${annotation.item}"))
                if (intent.resolveActivity(context.packageManager) != null) context.startActivity(intent)
                else Toast.makeText(context, "No email app is available. Copy this address: ${annotation.item}", Toast.LENGTH_LONG).show()
            }
        },
    )
}

@Composable
private fun informationSurface2(): Color {
    return if (MaterialTheme.colorScheme.background.luminance() > 0.5f) Color(0xFFEFECE6) else Color(0xFF1E2327)
}
