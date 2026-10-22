@file:OptIn(
    androidx.compose.material3.ExperimentalMaterial3Api::class,
    androidx.compose.foundation.layout.ExperimentalLayoutApi::class
)

package com.chastech.env

import com.chastech.env.ui.CharacterSpacedText as Text

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.OpenableColumns
import java.util.Locale
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.alpha
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.Image
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.mapSaver
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.zIndex
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.window.Popup
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.content.ContextCompat
import com.chastech.env.data.Catalog
import com.chastech.env.data.NativeDeveloperStudios
import com.chastech.env.data.developerStudioTools
import com.chastech.env.data.developerStudioForLegacyTool
import com.chastech.env.data.accessibilityDiscoveryTools
import com.chastech.env.data.accessibilityStudioForId
import com.chastech.env.data.displayTool
import com.chastech.env.data.FavoritesStore
import com.chastech.env.data.NativeCopy
import com.chastech.env.data.webSearch
import com.chastech.env.data.ToolRecord
import com.chastech.env.data.featuredOrPopular
import com.chastech.env.data.nativeDisclaimerText
import com.chastech.env.data.relatedTools
import com.chastech.env.data.fromJson
import com.chastech.env.data.search
import com.chastech.env.engine.NativeAudioEngine
import com.chastech.env.engine.NativeAudioWavProcessor
import com.chastech.env.engine.NativeCalculatorEngine
import com.chastech.env.engine.NativeBusinessEngine
import com.chastech.env.engine.NativeBusinessPdfExporter
import com.chastech.env.engine.NativeFileConverterEngine
import com.chastech.env.engine.NativeCodecEngine
import com.chastech.env.engine.NativeColorEngine
import com.chastech.env.engine.NativeConverterEngine
import com.chastech.env.engine.NativeDateTimeEngine
import com.chastech.env.engine.NativeDeveloperRecipe
import com.chastech.env.engine.NativeExpansionCalculatorEngine
import com.chastech.env.engine.NativeMathExerciseEngine
import com.chastech.env.engine.NativeMimeEngine
import com.chastech.env.engine.NativeRegexHighlight
import com.chastech.env.engine.NativeTextEngine
import com.chastech.env.engine.NativeUtilityEngine
import com.chastech.env.ui.ChasTechnologiesLogo
import com.chastech.env.ui.EnVIcon
import com.chastech.env.ui.EnVToolAppIcon
import com.chastech.env.ui.EnVLogo
import com.chastech.env.ui.EnVTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.Year

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val favorites = FavoritesStore(applicationContext)
        setContent {
            var themeMode by rememberSaveable { mutableStateOf(favorites.getThemeMode()) }
            val darkMode = when (themeMode) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
            SideEffect {
                val systemBarColor = if (darkMode) android.graphics.Color.BLACK else android.graphics.Color.WHITE
                val supportsLightNavigationBar = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1
                window.statusBarColor = systemBarColor
                window.navigationBarColor = if (darkMode || !supportsLightNavigationBar) android.graphics.Color.BLACK else android.graphics.Color.WHITE
                window.decorView.setBackgroundColor(systemBarColor)
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    isAppearanceLightStatusBars = !darkMode
                    isAppearanceLightNavigationBars = !darkMode && supportsLightNavigationBar
                }
            }
            EnVTheme(darkTheme = darkMode) {
            CatalogGate(
                    favorites,
                    darkMode,
                    themeMode,
                    onUseSystemTheme = {
                        themeMode = "system"
                        favorites.setThemeMode(themeMode)
                    },
                )
            }
        }
    }
}

@Composable
private fun CatalogGate(favorites: FavoritesStore, darkMode: Boolean, themeMode: String, onUseSystemTheme: () -> Unit) {
    val context = LocalContext.current.applicationContext
    var catalog by remember { mutableStateOf<Catalog?>(null) }
    var loadFailed by remember { mutableStateOf(false) }
    var retryCount by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(retryCount) {
        loadFailed = false
        val result = withContext(Dispatchers.IO) {
            runCatching {
                context.assets.open("catalog.json").bufferedReader().use { Catalog.fromJson(it.readText()) }
                    .also { require(it.tools.isNotEmpty()) { "The bundled tool catalog is empty." } }
            }
        }
        result.getOrNull()?.let { catalog = it } ?: run { loadFailed = true }
    }
    when {
        catalog != null -> EnVApp(catalog!!, favorites, darkMode, themeMode, onUseSystemTheme)
        loadFailed -> CatalogFailureScreen(darkMode) { retryCount += 1 }
        else -> NativeLaunchScreen(darkMode)
    }
}

@Composable
private fun NativeLaunchScreen(darkMode: Boolean) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            EnVLogo(Modifier.width(112.dp).height(75.dp), darkTheme = darkMode)
            Text("Useful tools, ready when you are.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun CatalogFailureScreen(darkMode: Boolean, onRetry: () -> Unit) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            EnVLogo(Modifier.width(112.dp).height(75.dp), darkTheme = darkMode)
            Text("The offline catalog couldn't be opened.", modifier = Modifier.padding(top = 12.dp))
            Button(onClick = onRetry, modifier = Modifier.padding(top = 16.dp)) { Text("Retry") }
        }
    }
}

private val productionExemptCategories = setOf("accessibility", "audio", "business", "calculators", "developer", "video")

private fun ToolRecord.isUnderProduction(): Boolean = !productionExemptCategories.contains(category.lowercase(Locale.ROOT))

private enum class AppTab { Home, Tools, Search, Saved, Account, Assistant }

@Composable
private fun EnVApp(catalog: Catalog, favorites: FavoritesStore, darkMode: Boolean, themeMode: String, onUseSystemTheme: () -> Unit) {
    val context = LocalContext.current
    var tab by rememberSaveable { mutableStateOf(AppTab.Home.name) }
    var query by rememberSaveable { mutableStateOf("") }
    var homeQuery by rememberSaveable { mutableStateOf("") }
    var assistantDraft by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var detailStack by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var productionTool by remember { mutableStateOf<ToolRecord?>(null) }
    val openTool: (String) -> Unit = { id ->
        val candidate = catalog.displayTool(id)
        val routeId = if (candidate?.category == "developer" && candidate.tags.none { it == "developer-studio" }) {
            val spec = NativeDeveloperStudios.forLegacySlug(candidate.slug)
            val mode = NativeDeveloperStudios.modeForLegacySlug(spec, candidate.slug)
            context.getSharedPreferences("env.developer-studio-modes", android.content.Context.MODE_PRIVATE)
                .edit().putString(spec.id, mode).apply()
            val decode = candidate.slug.endsWith("-decoder") || candidate.slug == "data-uri-decoder"
            context.getSharedPreferences("env.developer-studio-directions", android.content.Context.MODE_PRIVATE)
                .edit().putString(spec.id, if (decode) "decode" else "encode").apply()
            spec.id
        } else id
        val routeCandidate = catalog.displayTool(routeId) ?: candidate
        if (routeCandidate?.isUnderProduction() == true) {
            productionTool = routeCandidate
        } else {
            productionTool = null
            detailStack = listOf(routeId)
        }
    }
    val openRelatedTool: (String) -> Unit = { id ->
        val candidate = catalog.displayTool(id)
        if (candidate?.isUnderProduction() == true) {
            productionTool = candidate
        } else {
            productionTool = null
            detailStack = detailStack + id
        }
    }
    var showExchange by rememberSaveable { mutableStateOf(false) }
    var showInformation by rememberSaveable { mutableStateOf(false) }
    var informationPage by rememberSaveable { mutableStateOf("about") }
    var informationReturnTab by rememberSaveable { mutableStateOf(AppTab.Home.name) }
    var overflowExpanded by rememberSaveable { mutableStateOf(false) }
    var favoriteIds by remember { mutableStateOf(favorites.getFavorites()) }
    var mostUsedIds by remember { mutableStateOf(favorites.getMostUsed()) }
    var assistantMessages by remember { mutableStateOf(emptyList<AssistantChatMessage>()) }
    val selected = detailStack.lastOrNull()?.let(catalog::displayTool)
    LaunchedEffect(tab, selected?.id, showInformation, showExchange) {
        if (tab != AppTab.Home.name || selected != null || showInformation || showExchange) homeQuery = ""
    }
    LaunchedEffect(selected?.id) {
        selected?.id?.let {
            favorites.recordRecent(it)
            mostUsedIds = favorites.getMostUsed()
        }
    }
    if (detailStack.isNotEmpty()) BackHandler { detailStack = detailStack.dropLast(1) }
    else if (category != null) BackHandler { category = null }
    else if (showInformation) BackHandler { showInformation = false; tab = informationReturnTab }
    else if (showExchange) BackHandler { showExchange = false }
    else if (tab == AppTab.Assistant.name) BackHandler { tab = AppTab.Home.name }
    val currentTab = AppTab.entries.firstOrNull { it.name == tab } ?: AppTab.Home
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = { tab = AppTab.Home.name; detailStack = emptyList(); category = null; showExchange = false; showInformation = false }, modifier = Modifier.semantics { contentDescription = "Home" }) {
                        EnVIcon("Home", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                actions = {
                    IconButton(onClick = { tab = AppTab.Saved.name; detailStack = emptyList(); showExchange = false; showInformation = false }, modifier = Modifier.semantics { contentDescription = "Saved tools" }) {
                        EnVIcon("Heart", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { tab = AppTab.Tools.name; detailStack = emptyList(); showExchange = false; showInformation = false }, modifier = Modifier.semantics { contentDescription = "Tools" }) {
                        EnVIcon("LayoutGrid", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Box {
                        val context = LocalContext.current
                        IconButton(onClick = { overflowExpanded = true }, modifier = Modifier.semantics { contentDescription = "More options" }) {
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                repeat(3) { Box(Modifier.size(4.dp).background(MaterialTheme.colorScheme.onSurfaceVariant, CircleShape)) }
                            }
                        }
                        DropdownMenu(expanded = overflowExpanded, onDismissRequest = { overflowExpanded = false }) {

                            DropdownMenuItem(text = { Text("Account") }, onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://envtools.store/account"))); overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Wallet") }, onClick = { informationReturnTab = tab; informationPage = "wallet"; tab = AppTab.Account.name; detailStack = emptyList(); showExchange = false; showInformation = true; overflowExpanded = false })



                            Text("PRODUCT", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 16.dp, top = 10.dp, bottom = 4.dp))
                            DropdownMenuItem(text = { Text("About") }, onClick = { informationReturnTab = tab; informationPage = "about"; tab = AppTab.Account.name; detailStack = emptyList(); showExchange = false; showInformation = true; overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Tools") }, onClick = { tab = AppTab.Tools.name; detailStack = emptyList(); category = null; showExchange = false; showInformation = false; overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Pricing") }, onClick = { informationReturnTab = tab; informationPage = "pricing"; tab = AppTab.Account.name; detailStack = emptyList(); showExchange = false; showInformation = true; overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Token guide") }, onClick = { informationReturnTab = tab; informationPage = "token-guide"; tab = AppTab.Account.name; detailStack = emptyList(); showExchange = false; showInformation = true; overflowExpanded = false })
                            Text("RESOURCES", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 16.dp, top = 10.dp, bottom = 4.dp))
                            DropdownMenuItem(text = { Text("Help center") }, onClick = { informationReturnTab = tab; informationPage = "help"; tab = AppTab.Account.name; detailStack = emptyList(); showExchange = false; showInformation = true; overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Blog & guides") }, onClick = { CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse("https://envtools.store/blog")); overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Contact") }, onClick = { informationReturnTab = tab; informationPage = "contact"; tab = AppTab.Account.name; detailStack = emptyList(); showExchange = false; showInformation = true; overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Report bugs") }, onClick = { informationReturnTab = tab; informationPage = "report-bugs"; tab = AppTab.Account.name; detailStack = emptyList(); showExchange = false; showInformation = true; overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Suggest a tool") }, onClick = { informationReturnTab = tab; informationPage = "suggest-tool"; tab = AppTab.Account.name; detailStack = emptyList(); showExchange = false; showInformation = true; overflowExpanded = false })
                    }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            Column(Modifier.align(Alignment.TopCenter).widthIn(max = 1152.dp).fillMaxHeight()) {
                if (selected != null) {
                    ToolDetail(
                        catalog = catalog,
                        tool = selected,
                        isFavorite = selected.id in favoriteIds,
                        onHome = { detailStack = emptyList(); category = null; query = ""; tab = AppTab.Home.name },
                        onTools = { detailStack = emptyList(); category = null; query = ""; tab = AppTab.Tools.name },
                        onCategory = { value -> detailStack = emptyList(); category = value; query = ""; tab = AppTab.Tools.name },
                        onRelatedTool = openRelatedTool,
                        onToggleFavorite = { favoriteIds = favorites.toggle(selected.id) },
                    )
                } else {
                    when (currentTab) {
                        AppTab.Home -> HomeScreen(catalog, favoriteIds, mostUsedIds, homeQuery, { homeQuery = it }, { submitted -> query = submitted; category = null; tab = AppTab.Search.name }, { tab = AppTab.Tools.name }, { page -> informationReturnTab = tab; informationPage = page; tab = AppTab.Account.name; showInformation = true }, darkMode, openTool, { favoriteIds = favorites.toggle(it) }, { detailStack = emptyList(); category = null; tab = AppTab.Assistant.name })
                        AppTab.Assistant -> AssistantScreen(catalog, assistantMessages, { assistantMessages = it }, openTool, assistantDraft, { assistantDraft = it })
                        AppTab.Tools -> ToolsScreen(catalog, category, query, { query = it }, { category = it }, openTool, { tab = AppTab.Search.name })
                        AppTab.Search -> SearchScreen(catalog, query, { query = it }, openTool)
                        AppTab.Saved -> SavedScreen(catalog, favoriteIds, openTool, { favoriteIds = favorites.toggle(it) })
                        AppTab.Account -> when {
                            showExchange -> ContactExchangeScreen { showExchange = false }
                            showInformation -> NativeInformationScreen(informationPage, catalog) { showInformation = false; tab = informationReturnTab }
                            else -> AccountScreen(
                                catalog = catalog,
                                themeMode = themeMode,
                                onUseSystemTheme = onUseSystemTheme,
                                onOpenExchange = { showExchange = true },
                                onOpenInformation = { informationReturnTab = tab; informationPage = "about"; showInformation = true },
                                onOpenInformationPage = { page -> informationReturnTab = tab; informationPage = page; showInformation = true },
                            )
                        }
                    }
                }
            }
        }
    }
    productionTool?.let { requestedTool ->
        AlertDialog(
            onDismissRequest = { productionTool = null },
            icon = { EnVIcon("Clock", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) },
            title = { Text("Under production") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(requestedTool.name, style = MaterialTheme.typography.titleMedium)
                    Text("This tool is still being developed and is not available yet. You can keep browsing enV while we work on it.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            confirmButton = {
                TextButton(onClick = { productionTool = null }) { Text("Back to browsing") }
            },
        )
    }
}

@Composable
private fun HomeScreen(catalog: Catalog, favorites: Set<String>, mostUsedIds: List<String>, homeQuery: String, onQuery: (String) -> Unit, onSearch: (String) -> Unit, onTools: () -> Unit, onInformation: (String) -> Unit, darkMode: Boolean, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit, onAssistant: () -> Unit) {
    val screenWidth = LocalConfiguration.current.screenWidthDp
    val homeColumns = when { screenWidth >= 768 -> 3; screenWidth >= 640 -> 2; else -> 1 }
    val trending = remember(catalog, screenWidth) {
        catalog.accessibilityDiscoveryTools().filter { it.status == "active" || it.status == "beta" }
            .sortedByDescending { it.popularity }
            .take(12)
            .take(if (screenWidth >= 768) 12 else 6)
    }
    val mostUsed = remember(catalog, mostUsedIds) {
        mostUsedIds.mapNotNull { catalog.displayTool(it) }.distinctBy { it.id }.take(10)
    }
    val homeSurface2 = if (darkMode) Color(0xFF1E2327) else Color(0xFFEFECE6)
    val suggestions = remember(catalog, homeQuery) { if (homeQuery.isBlank()) emptyList() else catalog.webSearch(homeQuery, limit = 8, includeRelatedReferences = true) }
    var homeSearchFocused by remember { mutableStateOf(false) }
    val openHomeSearch = { val query = homeQuery.trim(); suggestions.firstOrNull()?.let { onTool(it.id) } ?: onSearch(query) }
    LazyColumn(contentPadding = PaddingValues(top = 4.dp, bottom = 0.dp), verticalArrangement = Arrangement.spacedBy(40.dp)) {
        item {
            Box(Modifier.fillMaxWidth().zIndex(if (homeSearchFocused && homeQuery.isNotBlank()) 1f else 0f), contentAlignment = Alignment.TopCenter) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(if (screenWidth >= 640) 20.dp else 16.dp), modifier = Modifier.widthIn(max = 800.dp).fillMaxWidth().padding(horizontal = 16.dp)) {
                EnVLogo(Modifier.width(if (screenWidth >= 640) 163.dp else 142.dp).height(if (screenWidth >= 640) 64.dp else 56.dp), darkTheme = darkMode, homeHero = true)
                BoxWithConstraints(Modifier.fillMaxWidth()) {
                    val suggestionWidth = maxWidth
                Surface(
                    modifier = Modifier.fillMaxWidth().height(if (screenWidth >= 640) 72.dp else 64.dp).onFocusChanged { homeSearchFocused = it.isFocused },
                    shape = RoundedCornerShape(percent = 50),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, if (homeSearchFocused) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                    shadowElevation = 1.dp,
                ) {
                    // Native search keeps the placeholder hidden on focus, left-aligns query text after the brand mark, and retains the trailing search action.
                    Row(Modifier.fillMaxSize().padding(horizontal = if (screenWidth >= 640) 20.dp else 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        EnVLogo(Modifier.width(56.dp).height(36.dp), darkTheme = darkMode)
                        Box(Modifier.weight(1f).padding(horizontal = 16.dp), contentAlignment = Alignment.CenterStart) {
                            if (homeQuery.isEmpty() && !homeSearchFocused) Text("Search for a tool", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Start, modifier = Modifier.fillMaxWidth())
                            BasicTextField(
                                value = homeQuery,
                                onValueChange = onQuery,
                                modifier = Modifier.fillMaxWidth().onFocusChanged { homeSearchFocused = it.isFocused }.semantics { contentDescription = "Search tools" },
                                textStyle = MaterialTheme.typography.bodyLarge.copy(fontSize = if (screenWidth >= 640) 18.sp else 16.sp, textAlign = TextAlign.Start, color = MaterialTheme.colorScheme.onSurface),
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                keyboardActions = KeyboardActions(onSearch = { openHomeSearch() }),
                            )
                        }
                        IconButton(onClick = { openHomeSearch() }, modifier = Modifier.size(44.dp).semantics { contentDescription = "Search all tools" }) { EnVIcon("Search", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary) }
                    }
                }
                if (homeSearchFocused && homeQuery.isNotBlank()) {
                    Popup(alignment = Alignment.TopStart, offset = IntOffset(0, with(LocalDensity.current) { (if (screenWidth >= 640) 80.dp else 72.dp).roundToPx() }), onDismissRequest = { homeSearchFocused = false }) {
                    Surface(Modifier.width(suggestionWidth), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 6.dp) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (suggestions.isEmpty()) {
                                Text("No matching tools. Try “json”, “bmi”, or “qr”.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                TextButton(onClick = { onSearch(homeQuery) }, modifier = Modifier.align(Alignment.End)) { Text("See more results") }
                            } else {
                                suggestions.forEach { tool -> WebHomeSearchSuggestion(tool, onTool) }
                                TextButton(onClick = { onSearch(homeQuery) }, modifier = Modifier.align(Alignment.End)) {
                                    Text("See more results", color = MaterialTheme.colorScheme.primary)
                                    Spacer(Modifier.width(8.dp))
                                    EnVIcon("ArrowRight", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                    }
                }
                }
                BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    val previewWidth = minOf(maxWidth * 0.84f, 640.dp)
                    Row(Modifier.width(previewWidth), horizontalArrangement = Arrangement.spacedBy(if (screenWidth >= 640) 12.dp else 8.dp)) {
                        HomePreviewBar("AI Agent", Modifier.weight(1f), isLarge = screenWidth >= 640, containerColor = homeSurface2, onClick = onAssistant)
                        HomePreviewBar("Total token = 100", Modifier.weight(1f), isLarge = screenWidth >= 640, containerColor = homeSurface2, onClick = { onInformation("token-dashboard") }, accessibilityLabel = "Open token dashboard")
                    }
                }
                MostUsedToolsTray(mostUsed, onTool, homeSurface2, Modifier.fillMaxWidth())
                Text("A focused toolkit for\neveryday work.", style = MaterialTheme.typography.headlineSmall.copy(fontSize = if (screenWidth >= 640) 36.sp else 24.sp), fontWeight = FontWeight.Normal, textAlign = androidx.compose.ui.text.style.TextAlign.Start, modifier = Modifier.fillMaxWidth().padding(top = if (screenWidth >= 640) 12.dp else 8.dp))
            }
            }
        }
        item {
            Column(Modifier.widthIn(max = 1152.dp).fillMaxWidth().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                SectionTitle("Trending tools", accent = true)
                trending.chunked(homeColumns).forEach { rowTools ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        rowTools.forEach { tool -> WebHomeToolCard(tool, onTool, Modifier.weight(1f)) }
                        repeat(homeColumns - rowTools.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                TextButton(onClick = onTools, modifier = Modifier.align(Alignment.End)) {
                    Text("See more tools", color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.width(8.dp))
                    EnVIcon("ArrowRight", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
        item { WebHomeFooter(catalog, onInformation, screenWidth) }
    }
}

@Composable
private fun MostUsedToolsTray(tools: List<ToolRecord>, onTool: (String) -> Unit, iconBackgroundColor: Color, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(28.dp)
    Surface(
        modifier = modifier.height(112.dp),
        shape = shape,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val visibleCount = if (maxWidth >= 768.dp) 10 else 5
            val cellWidth = (maxWidth - 24.dp - 12.dp * (visibleCount - 1).toFloat()) / visibleCount.toFloat()
            val iconSize = if (maxWidth >= 768.dp) 44.dp else 40.dp
            if (tools.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                    Text(
                        "Open tools to build your personal shortcuts.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            } else {
                LazyRow(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    items(tools, key = { it.id }) { tool ->
                        Column(
                            modifier = Modifier.width(cellWidth).clickable { onTool(tool.id) },
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            EnVToolAppIcon(tool, size = iconSize)
                            Text(
                                tool.name,
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WebHomeToolCard(tool: ToolRecord, onTool: (String) -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Card(modifier.fillMaxWidth().shadow(2.dp, shape, clip = false).border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.35f), shape).clickable { onTool(tool.id) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = shape, elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) {
        Column(Modifier.padding(16.dp).fillMaxWidth()) {
            EnVToolAppIcon(tool, size = 36.dp)
            Text(tool.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal, modifier = Modifier.padding(top = 12.dp))
            Text(tool.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
            if (tool.isUnderProduction()) Text("Under production", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
            else if (tool.status == "planned") Text("Coming soon", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
            else if (NativeCopy.isWebRuntimeOnly(tool.id)) Text("Web only", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
            else if (tool.clientSide) Text("On device", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) { EnVIcon("ArrowRight", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface) }
        }
    }
}

@Composable
private fun WebHomeSearchSuggestion(tool: ToolRecord, onTool: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onTool(tool.id) }.padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        EnVToolAppIcon(tool, size = 32.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(tool.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (tool.isUnderProduction()) Text("Under production", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                else if (tool.status == "planned") Text("Coming soon", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                else if (NativeCopy.isWebRuntimeOnly(tool.id)) Text("Web only", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(tool.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        EnVIcon("ArrowRight", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun WebHomeFooter(catalog: Catalog, onInformation: (String) -> Unit, screenWidth: Int) {
    val horizontalPadding = if (screenWidth >= 640) 24.dp else 16.dp
    val footerSubtle = if (isSystemInDarkTheme()) Color(0xFF7C848C) else Color(0xFF8A9098)
    val borderColor = MaterialTheme.colorScheme.outline
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
            if (screenWidth >= 768) {
                Row(
                    Modifier.widthIn(max = 1152.dp).fillMaxWidth().padding(horizontal = horizontalPadding, vertical = 28.dp),
                    horizontalArrangement = Arrangement.spacedBy(40.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    BrandFooterIdentity(catalog, Modifier.weight(3f))
                    FooterLegalLinks(onInformation, footerSubtle, Modifier.weight(1f))
                }
            } else {
                Column(
                    Modifier.widthIn(max = 1152.dp).fillMaxWidth().padding(horizontal = horizontalPadding, vertical = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(24.dp),
                ) {
                    BrandFooterIdentity(catalog)
                    FooterLegalLinks(onInformation, footerSubtle)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(borderColor))
        Row(
            Modifier.widthIn(max = 1152.dp).fillMaxWidth().align(Alignment.CenterHorizontally).padding(horizontal = horizontalPadding, vertical = 12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("© ${Year.now().value} chAs Technologies LLC · enV", color = footerSubtle,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 18.sp))
            if (screenWidth >= 640) Text("${catalog.categories.size} categories · ${catalog.browserActiveToolCount} live tools", color = footerSubtle,
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp, lineHeight = 18.sp))
        }
    }
}

@Composable
private fun BrandFooterIdentity(catalog: Catalog, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        EnVLogo(Modifier.width(84.dp).height(56.dp))
        Text("Useful tools. One place. ${catalog.browserActiveToolCount} browser tools you can use without an account. Files and text stay on your device unless a tool says otherwise.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp, lineHeight = 21.sp),
            modifier = Modifier.widthIn(max = 384.dp))
    }
}

@Composable
private fun FooterLegalLinks(onInformation: (String) -> Unit, footerSubtle: Color, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text("Legal".uppercase(), color = footerSubtle,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp, lineHeight = 18.sp, letterSpacing = 0.6.sp),
            fontWeight = FontWeight.Normal)
        Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Privacy" to "privacy", "Terms" to "terms", "Disclaimer" to "disclaimer", "Responsible use" to "responsible-use").forEach { (label, route) ->
                Row(Modifier.fillMaxWidth().height(32.dp).clickable { onInformation(route) },
                    verticalAlignment = Alignment.CenterVertically) {
                    Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp, lineHeight = 21.sp))
                }
            }
        }
    }
}

@Composable
private fun ToolsScreen(catalog: Catalog, category: String?, query: String, onQuery: (String) -> Unit, onCategory: (String?) -> Unit, onTool: (String) -> Unit, onSearch: () -> Unit) {
    if (category != null) {
        CategoryScreen(catalog, category, { onCategory(null) }, onTool)
        return
    }
    val visibleCounts = remember { mutableStateMapOf<String, Int>() }
    LaunchedEffect(query) { visibleCounts.clear() }
    val screenWidth = LocalConfiguration.current.screenWidthDp
    val columns = when { screenWidth >= 1024 -> 3; screenWidth >= 640 -> 2; else -> 1 }
    val groupedTools = remember(catalog, query) {
        val byCategory = catalog.webSearch(query, includeRelatedReferences = true).groupBy { it.category }
        catalog.categories.mapNotNull { item -> byCategory[item.id]?.let { item to it } }
    }
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 40.dp),
        verticalArrangement = Arrangement.spacedBy(40.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
                    Text("All tools", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Normal, maxLines = 1, modifier = Modifier.weight(1f))
                    WebToolsSearchField(
                        catalog = catalog,
                        query = query,
                        onQuery = onQuery,
                        modifier = Modifier.width(if (screenWidth >= 640) 288.dp else (screenWidth * 0.52f).dp),
                        onTool = onTool,
                        onSubmit = {
                            val first = catalog.webSearch(query, limit = 8, includeRelatedReferences = true).firstOrNull()
                            if (query.isNotBlank() && first != null) onTool(first.id) else onSearch()
                        },
                        onSeeMore = onSearch,
                    )
                }
                Text("Find a tool by name or browse the categories below.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (groupedTools.isEmpty()) {
            item {
                Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(12.dp), shadowElevation = 1.dp) {
                    Text("No tools match your search. Try another name or keyword.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(24.dp))
                }
            }
        } else {
            items(groupedTools, key = { it.first.id }) { group ->
                val groupCategory = group.first
                val tools = group.second
                val visible = minOf(visibleCounts[groupCategory.id] ?: 3, tools.size)
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxWidth().clickable { onCategory(groupCategory.id) },
                    ) {
                        Surface(Modifier.size(40.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp)) {
                            Box(contentAlignment = Alignment.Center) { EnVIcon(groupCategory.icon, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface) }
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
                            // Source guard contract: groupCategory.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.primary; contentAlignment = Alignment.CenterEnd; Text("See more tools", color = MaterialTheme.colorScheme.primary)
                            Text(groupCategory.name, style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp), fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.primary)
                            Text(groupCategory.blurb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                    }
                    tools.take(visible).chunked(columns).forEach { rowTools ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            rowTools.forEach { tool -> WebToolsCard(tool, onTool, Modifier.weight(1f)) }
                            repeat(columns - rowTools.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                    if (visible < tools.size) {
                        WebSeeMoreToolsButton { visibleCounts[groupCategory.id] = minOf(visible + 6, tools.size) }
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryScreen(catalog: Catalog, categoryId: String, onBack: () -> Unit, onTool: (String) -> Unit) {
    val category = catalog.categories.find { it.id == categoryId }
    val tools = remember(catalog, categoryId) {
        val source = when (categoryId) {
            "accessibility" -> catalog.accessibilityDiscoveryTools()
            // The full Developer catalog remains searchable; category browsing shows Studios only.
            "developer" -> catalog.developerStudioTools()
            else -> catalog.tools + catalog.relatedReferenceTools
        }
        source.filter { it.category == categoryId }
            .sortedWith(compareByDescending<ToolRecord> { it.popularity }.thenBy { it.name })
    }
    var visibleCount by rememberSaveable(categoryId) { mutableIntStateOf(6) }
    val screenWidth = LocalConfiguration.current.screenWidthDp
    val columns = when { screenWidth >= 1024 -> 3; screenWidth >= 640 -> 2; else -> 1 }
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 40.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = "Back to all tools" }) {
                    EnVIcon("ArrowLeft", tint = MaterialTheme.colorScheme.onSurface)
                }
                Surface(Modifier.size(44.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp)) {
                    Box(contentAlignment = Alignment.Center) { EnVIcon(category?.icon ?: "Folder", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface) }
                }
                Column(Modifier.padding(start = 4.dp)) {
                    Text(category?.name ?: categoryId, style = MaterialTheme.typography.headlineSmall.copy(fontSize = 30.sp), fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.primary)
                    Text(category?.description ?: "Tools in this category.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (tools.isEmpty()) {
            item {
                Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(12.dp), shadowElevation = 1.dp) {
                    Text("No tools in this category yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(24.dp))
                }
            }
        } else {
            item { ToolGrid(tools.take(visibleCount), columns, onTool) }
            if (visibleCount < tools.size) {
                item {
                    WebSeeMoreToolsButton { visibleCount = minOf(visibleCount + 6, tools.size) }
                }
            }
        }
    }
}

@Composable
private fun ToolGrid(tools: List<ToolRecord>, columns: Int, onTool: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        tools.chunked(columns).forEach { rowTools ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                rowTools.forEach { tool -> WebToolsCard(tool, onTool, Modifier.weight(1f)) }
                repeat(columns - rowTools.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun WebToolsSearchField(
    catalog: Catalog,
    query: String,
    onQuery: (String) -> Unit,
    modifier: Modifier,
    onTool: (String) -> Unit,
    onSubmit: () -> Unit,
    onSeeMore: () -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val suggestions = remember(catalog, query) { if (query.isBlank()) emptyList() else catalog.webSearch(query, limit = 8, includeRelatedReferences = true) }
    Column(modifier) {
        Surface(Modifier.fillMaxWidth().height(44.dp), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(22.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline), shadowElevation = 1.dp) {
            Row(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                EnVIcon("Search", Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) Text("Search tools", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    BasicTextField(value = query, onValueChange = onQuery, modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }.semantics { contentDescription = "Search tools" }, textStyle = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurface), singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { onSubmit() }))
                }
            }
        }
        if (focused && query.isNotBlank()) {
            Surface(Modifier.fillMaxWidth().padding(top = 8.dp), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 2.dp) {
                Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (suggestions.isEmpty()) Text("No matching tools. Try “json”, “bmi”, or “qr”.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp))
                    else suggestions.forEach { WebHomeSearchSuggestion(it, onTool) }
                    TextButton(onClick = { focused = false; onSeeMore() }, modifier = Modifier.align(Alignment.End)) { Text("See more results") }
                }
            }
        }
    }
}

@Composable
private fun WebToolsCard(tool: ToolRecord, onTool: (String) -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(12.dp)
    Column(modifier.fillMaxWidth().alpha(if (tool.status == "planned") 0.7f else 1f).shadow(2.dp, shape, clip = false).border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.35f), shape).background(MaterialTheme.colorScheme.surface, shape).clickable { onTool(tool.id) }.padding(16.dp)) {
        EnVToolAppIcon(tool, size = 36.dp)
        Text(tool.name, style = MaterialTheme.typography.titleSmall.copy(letterSpacing = (-0.35).sp), fontWeight = FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 12.dp))
        Text(tool.description, style = MaterialTheme.typography.bodySmall.copy(lineHeight = 20.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
        if (tool.isUnderProduction()) Text("Under production", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
        else if (tool.status == "planned") Text("Coming soon", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
        else if (NativeCopy.isWebRuntimeOnly(tool.id)) Text("Web only", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
        else if (tool.clientSide) Text("On device", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.End) { EnVIcon("ArrowRight", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface) }
    }
}

@Composable
private fun WebSeeMoreToolsButton(onClick: () -> Unit) {
    Surface(Modifier.fillMaxWidth().wrapContentWidth(Alignment.End).clickable(onClick = onClick), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(8.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline), shadowElevation = 1.dp) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("See more tools", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.primary)
            EnVIcon("ChevronDown", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun SearchScreen(catalog: Catalog, query: String, onQuery: (String) -> Unit, onTool: (String) -> Unit) {
    var visibleCount by rememberSaveable { mutableIntStateOf(24) }
    var searchFocused by remember { mutableStateOf(false) }
    LaunchedEffect(query) { visibleCount = 24 }
    val results = remember(catalog, query) { if (query.trim().isEmpty()) emptyList() else catalog.webSearch(query, includeRelatedReferences = true) }
    val screenWidth = LocalConfiguration.current.screenWidthDp
    val columns = when { screenWidth >= 1024 -> 3; screenWidth >= 640 -> 2; else -> 1 }
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        item {
            Box(Modifier.fillMaxWidth().zIndex(if (searchFocused && query.isNotBlank()) 1f else 0f)) {
                Column(Modifier.fillMaxWidth()) {
                    Text("Search tools", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Normal)
                    Text("Find a tool by name, category, or keyword.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
                    SearchBox(catalog, query, onQuery, onTool) { searchFocused = it }
                }
            }
        }
        if (query.trim().isEmpty()) {
            item { Text("Start typing to see matching tools.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            item {
                Text("Results for “$query”", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Normal)
                Text("${results.size} matching tools", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            }
            if (results.isEmpty()) {
                item {
                    Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(12.dp), shadowElevation = 1.dp) {
                        Text("No matching tools. Try a broader word such as “image”, “video”, or “calculator”.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp))
                    }
                }
            } else {
                item { ToolGrid(results.take(visibleCount), columns, onTool) }
                if (visibleCount < results.size) {
                    item {
                        OutlinedButton(onClick = { visibleCount = minOf(visibleCount + 24, results.size) }) { Text("See more results") }
                    }
                }
            }
        }
    }
}

@Composable
private fun SavedScreen(catalog: Catalog, favorites: Set<String>, onTool: (String) -> Unit, onToggle: (String) -> Unit) {
    val tools = (catalog.tools + catalog.relatedReferenceTools).filter { it.id in favorites }
        .map { catalog.accessibilityStudioForId(it.id) ?: it }.distinctBy { it.id }.sortedBy { it.name }
    Column(Modifier.fillMaxSize()) {
        Text("Saved", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Normal, modifier = Modifier.padding(20.dp))
        ToolList(tools, favorites, onTool, onToggle, Modifier.weight(1f), "Save a tool to find it here across restarts.")
    }
}

@Composable
private fun AccountScreen(catalog: Catalog, themeMode: String, onUseSystemTheme: () -> Unit, onOpenExchange: () -> Unit, onOpenInformation: () -> Unit, onOpenInformationPage: (String) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Account", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Normal)
        Text("Native settings", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal)
        SettingCard(
            "Appearance",
            if (themeMode == "system") "Following device light/dark setting" else "Custom theme active · tap to follow the device",
            "Sun",
            onClick = onUseSystemTheme,
        )
        SettingCard("Offline catalog", "${catalog.counts.total} tools are bundled on this device", "Wrench")
        SettingCard("Favorites", "Stored locally with SharedPreferences", "Heart")
        SettingCard("Account", "Sign in or create an account to sync supported enV features.", "Info", onClick = { onOpenInformationPage("account") })
        SettingCard("History", "Recently used tools will appear here.", "Info", onClick = { onOpenInformationPage("history") })
        SettingCard("Instant Contact Exchange", "Nearby peer-to-peer contact sharing with explicit activation and native Contacts saving", "Contact", onClick = onOpenExchange)
        SettingCard("Migration status", "${catalog.tools.count { (it.status == "active" || it.status == "beta") && nativeSupported(it) }} of ${catalog.counts.active} active tools run natively and offline. Web-only tools are never routed through the website.", "Hammer")
        SettingCard("About enV & chAs Technologies LLC", "Company details, policies, and pricing", "Info", onClick = onOpenInformation)
    }
}

private fun nativeSupported(tool: ToolRecord): Boolean = !NativeCopy.isWebRuntimeOnly(tool.id) && when { NativeBackendEngine.supports(tool) -> false; tool.status == "planned" -> false; NativeAudioEngine.supports(tool) -> true; else -> when (tool.engine.type) {
    "business" -> NativeBusinessEngine.supports(tool)
    "custom" -> NativeProductivityEngine.supports(tool.id) || NativeAccessibilityEngine.supports(tool.id, tool.category) || NativeEventEngine.supports(tool.id)
    "ai" -> NativeAiEngine.supports(tool)
    "file-converter", "document-backend" -> NativeFileConverterEngine.supports(tool)
    "text" -> NativeTextEngine.operationForTool(tool.id) != null
    "codec" -> NativeCodecEngine.operationForTool(tool.id) != null
    "color" -> NativeColorEngine.operationForTool(tool.id) != null
    "datetime" -> NativeDateTimeEngine.operationForTool(tool.id) != null
    "barcode", "qr" -> NativeBarcodeEngine.supports(tool)
    "image" -> NativeImageEngine.supports(tool)
    "mime" -> NativeMimeEngine.operationForTool(tool.id) != null
    "converter" -> NativeConverterEngine.operationForTool(tool) != null
    "calculator" -> NativeCalculatorEngine.operationForTool(tool.id) != null || NativeExpansionCalculatorEngine.operationForTool(tool.id) != null || NativeMathExerciseEngine.operationForTool(tool.id) != null
    "generator", "network", "seo", "developer", "cssgen" -> NativeUtilityEngine.supports(tool)
    else -> false
    }
}

private fun nativeBackendSupported(tool: ToolRecord): Boolean = !NativeCopy.isWebRuntimeOnly(tool.id) && NativeBackendEngine.supports(tool)

@Composable
private fun ToolDetail(
    catalog: Catalog,
    tool: ToolRecord,
    isFavorite: Boolean,
    onHome: () -> Unit,
    onTools: () -> Unit,
    onCategory: (String) -> Unit,
    onRelatedTool: (String) -> Unit,
    onToggleFavorite: () -> Unit,
) {
    val supported = nativeSupported(tool)
    val backend = nativeBackendSupported(tool)
    val context = LocalContext.current
    val related = remember(catalog, tool) { catalog.relatedTools(tool, Int.MAX_VALUE) }
    val parentDeveloperStudio = remember(catalog, tool) { catalog.developerStudioForLegacyTool(tool) }
    var visibleRelatedCount by remember(tool.id) { mutableIntStateOf(6) }
    val categoryName = catalog.categories.firstOrNull { it.id == tool.category }?.name ?: tool.category
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val compact = maxWidth < 640.dp
        Column(
            Modifier.widthIn(max = 1024.dp).fillMaxWidth().align(Alignment.TopCenter)
                .verticalScroll(rememberScrollState()).imePadding()
                .padding(horizontal = if (compact) 16.dp else 24.dp, vertical = if (compact) 32.dp else 40.dp),
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                NativeBreadcrumbLink("Home", onHome)
                Text("/", style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                NativeBreadcrumbLink("Tools", onTools)
                Text("/", style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                NativeBreadcrumbLink(categoryName) { onCategory(tool.category) }
                Text("/", style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(tool.name, style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp), color = MaterialTheme.colorScheme.onSurface)
            }
            Spacer(Modifier.height(24.dp))
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 0.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(if (compact) 8.dp else 16.dp),
                ) {
                    NativeToolHeader(tool, compact, Modifier.weight(1f), showDescription = !compact)
                    NativeToolSaveButton(isFavorite, onToggleFavorite)
                }
                if (compact) {
                    Text(
                        tool.description,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp, lineHeight = 20.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth().padding(start = if (compact) 56.dp else 0.dp),
                    )
                }
            }
            tool.nativeDisclaimerText()?.let { notice ->
                Text(notice, style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
            }
            if (parentDeveloperStudio != null) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Part of ${parentDeveloperStudio.name}", style = MaterialTheme.typography.titleSmall)
                            Text("Switch between related local developer tasks in the grouped Studio workspace.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        OutlinedButton(onClick = { onRelatedTool(parentDeveloperStudio.id) }) { Text("Open Studio") }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
            Spacer(Modifier.height(24.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background),
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
            ) {
                Column(Modifier.fillMaxWidth().padding(if (compact) 16.dp else 24.dp)) {
                    when {
                        backend -> NativeBackendToolForm(tool, true)
                        supported -> NativeToolForm(tool, onRelatedTool)
                        tool.status == "planned" -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            StatusPill("Coming soon")
                            Text("This tool is not yet implemented natively.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            StatusPill("Web only")
                            Text("This tool is available in the Web product and is not executable natively.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Button(onClick = {
                                val url = Uri.Builder().scheme("https").authority("envtools.store")
                                    .appendPath("tools").appendPath(tool.category).appendPath(tool.slug).build()
                                context.startActivity(Intent(Intent.ACTION_VIEW, url))
                            }) { Text("Open in Web") }
                        }
                    }
                }
            }
            if (hasNativeAiAssist(tool.id)) {
                Spacer(Modifier.height(16.dp))
                NativeAiAssistPanel(tool)
            }
            Spacer(Modifier.height(40.dp))
            Text("What this tool does", style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp), fontWeight = FontWeight.Normal)
            Text(tool.description, style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp, lineHeight = 20.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            TextButton(
                onClick = {
                    CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(
                        context,
                        Uri.parse("https://envtools.store/blog/tool-${tool.id}"),
                    )
                },
                modifier = Modifier.padding(top = 2.dp),
            ) { Text("Read the full guide") }
            if (related.isNotEmpty()) {
                Spacer(Modifier.height(40.dp))
                Text("Related tools", style = MaterialTheme.typography.titleMedium.copy(fontSize = 18.sp), fontWeight = FontWeight.Normal, color = MaterialTheme.colorScheme.primary)
                Column(Modifier.fillMaxWidth().padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    related.take(visibleRelatedCount).chunked(if (compact) 1 else 2).forEach { rowTools ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            rowTools.forEach { item ->
                                Box(Modifier.weight(1f)) { RelatedToolCard(item) { onRelatedTool(item.id) } }
                            }
                            if (!compact && rowTools.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
                if (related.size > visibleRelatedCount) {
                    TextButton(onClick = { visibleRelatedCount = (visibleRelatedCount + 6).coerceAtMost(related.size) }, modifier = Modifier.fillMaxWidth().wrapContentWidth(Alignment.End)) {
                        Text("See more", color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(4.dp))
                        EnVIcon("ChevronDown", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
private fun NativeToolHeader(tool: ToolRecord, compact: Boolean, modifier: Modifier = Modifier, showDescription: Boolean = true) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        EnVToolAppIcon(tool, size = 44.dp)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(tool.name, style = MaterialTheme.typography.headlineSmall.copy(fontSize = if (compact) 24.sp else 30.sp, lineHeight = if (compact) 30.sp else 36.sp), fontWeight = FontWeight.Normal)
                if (tool.status == "planned") StatusPill("Coming soon")
            }
            if (showDescription) {
                Text(tool.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun NativeGuideSection(
    heading: String,
    paragraphs: List<String>,
    steps: List<String> = emptyList(),
    bullets: List<String> = emptyList(),
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(heading, style = MaterialTheme.typography.titleSmall)
        paragraphs.forEach { paragraph ->
            Text(paragraph, style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp, lineHeight = 20.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (steps.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                steps.forEachIndexed { index, step ->
                    Text("${index + 1}. $step", style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp, lineHeight = 20.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (bullets.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                bullets.forEach { item ->
                    Text("• $item", style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp, lineHeight = 20.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
private fun NativeBreadcrumbLink(label: String, onClick: () -> Unit) {
    Text(label, modifier = Modifier.clickable(onClick = onClick), style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun NativeToolSaveButton(isFavorite: Boolean, onClick: () -> Unit) {
    if (isFavorite) Button(onClick = onClick) { EnVIcon("Heart", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onPrimary); Spacer(Modifier.width(6.dp)); Text("Saved") }
    else OutlinedButton(onClick = onClick) { EnVIcon("Heart", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface); Spacer(Modifier.width(6.dp)); Text("Save") }
}

@Composable
private fun RelatedToolCard(tool: ToolRecord, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.background), shape = RoundedCornerShape(8.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)), elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                EnVToolAppIcon(tool, size = 32.dp)
                Text(tool.name, style = MaterialTheme.typography.bodySmall.copy(fontSize = 14.sp), fontWeight = FontWeight.Normal, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text(tool.description, style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp), color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                EnVIcon("ArrowRight", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface)
            }
        }
    }
}

@Composable
private fun NativeToolForm(tool: ToolRecord, onRelatedTool: (String) -> Unit) {
    when (tool.engine.type) {
        "business" -> NativeBusinessToolForm(tool)
        "audio" -> if (tool.id == "music-live-video-studio") NativeMusicLiveVideoStudio() else NativeAudioToolForm(tool)
        "ai" -> NativeAiToolForm(tool)
        "file-converter", "document-backend" -> NativeFileConverterToolForm(tool)
        "text" -> NativeTextToolForm(tool.id)
        "codec" -> NativeCodecToolForm(tool.id)
        "color" -> NativeColorToolForm(tool.id)
        "datetime" -> NativeDateTimeToolForm(tool.id)
        "barcode", "qr" -> NativeBarcodeToolForm(tool.id)
        "image" -> NativeImageToolForm(tool)
        "mime" -> NativeMimeToolForm(tool.id)
        "converter" -> NativeConverterToolForm(tool)
        "calculator" -> when {
            NativeAudioEngine.supports(tool) -> NativeAudioToolForm(tool)
            NativeCalculatorEngine.operationForTool(tool.id) != null -> NativeCalculatorToolForm(tool)
            NativeExpansionCalculatorEngine.operationForTool(tool.id) != null -> NativeExpansionCalculatorToolForm(tool.id)
            NativeMathExerciseEngine.operationForTool(tool.id) != null -> NativeMathExerciseToolForm(tool.id)
            else -> Text("This native calculator engine is not available offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        "generator", "network", "seo", "cssgen" -> NativeUtilityToolForm(tool)
        "developer" -> if (tool.id == "ux-ui-studio") NativeUxUiStudioForm() else NativeDeveloperToolForm(tool, onRelatedTool)
    "custom" -> when {
        NativeProductivityEngine.supports(tool.id) -> NativeProductivityToolForm(tool.id)
        NativeAccessibilityEngine.supports(tool.id, tool.category) -> NativeAccessibilityToolForm(tool)
        NativeEventEngine.supports(tool.id) -> NativeEventToolForm(tool.id)
        else -> Text("This native custom engine is not available offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
        else -> Text("This tool is not yet implemented natively.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}


private val nativeProductivityStateSaver = mapSaver<NativeProductivityEngine.State>(
    save = { state -> mapOf(
        "mode" to state.mode.name,
        "running" to state.running,
        "hasStarted" to state.hasStarted,
        "valueMs" to state.valueMs,
        "anchorMs" to (state.anchorMs ?: -1L),
        "phase" to state.phase.name,
        "round" to state.round,
        "focusMinutes" to state.focusMinutes,
        "breakMinutes" to state.breakMinutes,
        "laps" to state.lapsMs.joinToString(","),
    ) },
    restore = { saved ->
        NativeProductivityEngine.State(
            mode = NativeProductivityEngine.Mode.valueOf(saved["mode"] as String),
            running = saved["running"] as Boolean,
            hasStarted = saved["hasStarted"] as Boolean,
            valueMs = saved["valueMs"] as Long,
            anchorMs = (saved["anchorMs"] as Long).takeIf { it >= 0L },
            phase = NativeProductivityEngine.Phase.valueOf(saved["phase"] as String),
            round = saved["round"] as Int,
            focusMinutes = saved["focusMinutes"] as Int,
            breakMinutes = saved["breakMinutes"] as Int,
            lapsMs = (saved["laps"] as String).split(",").mapNotNull { it.toLongOrNull() },
        )
    },
)

@Composable
private fun NativeProductivityToolForm(toolId: String) {
    val mode = NativeProductivityEngine.modeFor(toolId)
    if (mode == null) {
        Text("This native productivity timer is not available offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    var timerState by rememberSaveable(toolId, stateSaver = nativeProductivityStateSaver) {
        mutableStateOf(NativeProductivityEngine.create(mode))
    }
    var focusInput by rememberSaveable(toolId) { mutableStateOf("50") }
    var breakInput by rememberSaveable(toolId) { mutableStateOf("10") }
    LaunchedEffect(timerState.running, mode) {
        while (timerState.running) {
            kotlinx.coroutines.delay(if (mode == NativeProductivityEngine.Mode.STOPWATCH) 50L else 250L)
            timerState = NativeProductivityEngine.advance(timerState, SystemClock.elapsedRealtime())
        }
    }
    val now = SystemClock.elapsedRealtime()
    val displayMs = NativeProductivityEngine.displayedMs(timerState, now)
    val display = if (mode == NativeProductivityEngine.Mode.STOPWATCH) NativeProductivityEngine.formatStopwatch(displayMs)
        else NativeProductivityEngine.formatCountdown(displayMs)
    val title = when (mode) {
        NativeProductivityEngine.Mode.STOPWATCH -> "Stopwatch"
        NativeProductivityEngine.Mode.POMODORO -> "Round ${timerState.round} · ${timerState.phase.name.lowercase().replaceFirstChar { it.uppercase() }}"
        NativeProductivityEngine.Mode.FOCUS -> timerState.phase.name.lowercase().replaceFirstChar { it.uppercase() }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (mode == NativeProductivityEngine.Mode.FOCUS) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = focusInput,
                    onValueChange = { value ->
                        focusInput = value
                        value.toIntOrNull()?.let {
                            timerState = NativeProductivityEngine.setFocusDurations(timerState, it, breakInput.toIntOrNull() ?: timerState.breakMinutes)
                        }
                    },
                    label = { Text("Focus minutes (1–240)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = breakInput,
                    onValueChange = { value ->
                        breakInput = value
                        value.toIntOrNull()?.let {
                            timerState = NativeProductivityEngine.setFocusDurations(timerState, focusInput.toIntOrNull() ?: timerState.focusMinutes, it)
                        }
                    },
                    label = { Text("Break minutes (1–240)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
            }
            Text("Use whole minutes. Values are limited to 1–240 minutes.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(display, style = MaterialTheme.typography.displayLarge, modifier = Modifier.semantics { contentDescription = "Time: $display" })
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button({ timerState = NativeProductivityEngine.toggle(timerState, SystemClock.elapsedRealtime()) }) {
                Text(if (timerState.running) "Pause" else if (timerState.hasStarted) "Resume" else "Start")
            }
            if (mode == NativeProductivityEngine.Mode.STOPWATCH) {
                OutlinedButton({ timerState = NativeProductivityEngine.lap(timerState, SystemClock.elapsedRealtime()) }, enabled = timerState.running) { Text("Lap") }
            } else if (mode == NativeProductivityEngine.Mode.POMODORO) {
                OutlinedButton({ timerState = NativeProductivityEngine.skip(timerState, SystemClock.elapsedRealtime()) }) { Text("Skip") }
            }
            OutlinedButton({ timerState = NativeProductivityEngine.reset(timerState) }) { Text("Reset") }
        }
        if (timerState.lapsMs.isNotEmpty()) {
            Text("Laps", style = MaterialTheme.typography.titleSmall)
            timerState.lapsMs.forEachIndexed { index, lap ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Lap ${index + 1}")
                    Text(NativeProductivityEngine.formatStopwatch(lap), style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
        Text(
            when (mode) {
                NativeProductivityEngine.Mode.STOPWATCH -> "Uses a monotonic clock for elapsed time. Keep enV open to view live updates."
                NativeProductivityEngine.Mode.POMODORO -> "Standard 25-minute focus and 5-minute break cycle. No background alert is promised."
                NativeProductivityEngine.Mode.FOCUS -> "Set focus and break lengths from 1 to 240 minutes. No background alert is promised."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun NativeBarcodeToolForm(toolId: String) {
    val context = LocalContext.current
    val fields = remember(toolId) { NativeBarcodeEngine.fieldsFor(toolId) }
    var values by rememberSaveable(toolId) { mutableStateOf(NativeBarcodeEngine.initialValues(toolId)) }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    var images by remember(toolId) { mutableStateOf(emptyList<android.graphics.Bitmap>()) }
    var exportText by rememberSaveable(toolId) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        fields.forEach { field ->
            val hint = if (field.options.isEmpty()) field.label else "${field.label} · ${field.options.joinToString(" / ")}"
            InputField(values[field.key] ?: field.defaultValue, { values = values + (field.key to it) }, hint, minLines = if (field.multiline) 3 else 1, singleLine = !field.multiline)
        }
        ActionRow(onRun = {
            runCatching { NativeBarcodeEngine.execute(toolId, values) }.fold({ result -> output = result.text; images = result.images; exportText = result.exportText.orEmpty(); error = "" }, { images = emptyList(); output = ""; exportText = ""; error = it.message ?: "Unable to run barcode operation" })
        }, onReset = { values = NativeBarcodeEngine.initialValues(toolId); output = ""; error = ""; images = emptyList(); exportText = "" })
        ResultBox(output, error, ::copy)
        images.forEachIndexed { index, image -> Image(bitmap = image.asImageBitmap(), contentDescription = "Generated code ${index + 1}", modifier = Modifier.fillMaxWidth().height(240.dp)) }
        if (exportText.isNotEmpty()) {
            Text("Export data", style = MaterialTheme.typography.labelLarge)
            Text(exportText.take(512) + if (exportText.length > 512) "…" else "", maxLines = 5, style = MaterialTheme.typography.bodySmall)
            OutlinedButton(onClick = { copy(exportText) }) { Text("Copy export data") }
        }
    }
}

@Composable
private fun NativeConverterToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val operation = NativeConverterEngine.operationForTool(tool) ?: return
    val units = NativeConverterEngine.systemsFor(operation)
    var value by rememberSaveable(tool.id) { mutableStateOf("1") }
    var from by rememberSaveable(tool.id) { mutableStateOf(units.firstOrNull()?.id.orEmpty()) }
    var to by rememberSaveable(tool.id) { mutableStateOf(units.getOrNull(1)?.id ?: units.firstOrNull()?.id.orEmpty()) }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        InputField(value, { value = it }, "Value", singleLine = true)
        Text("From unit ID · ${units.take(5).joinToString { it.id }}${if (units.size > 5) " …" else ""}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        InputField(from, { from = it.trim() }, "From unit", singleLine = true)
        Text("To unit ID · ${units.take(5).joinToString { it.id }}${if (units.size > 5) " …" else ""}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        InputField(to, { to = it.trim() }, "To unit", singleLine = true)
        if (operation.mode != "standard") Text("Mode: ${operation.mode}. This mode returns the full reference/comparison set.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        ActionRow(
            onRun = { runCatching { NativeConverterEngine.run(operation, value, from, to) }.fold({ output = it; error = "" }, { output = ""; error = it.message ?: "Unable to run converter" }) },
            onReset = { value = "1"; from = units.firstOrNull()?.id.orEmpty(); to = units.getOrNull(1)?.id ?: units.firstOrNull()?.id.orEmpty(); output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

private data class NativeAudioJoinInput(val name: String, val bytes: ByteArray)

@Composable
private fun NativeAudioWavJoinerForm(toolName: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var files by remember { mutableStateOf<List<NativeAudioJoinInput>>(emptyList()) }
    var pendingExport by remember { mutableStateOf<ByteArray?>(null) }
    var output by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var showJoinerNotes by rememberSaveable { mutableStateOf(false) }
    val openLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val maxBytes = 100 * 1024 * 1024
                    var total = 0
                    uris.map { uri ->
                        val input = context.contentResolver.openInputStream(uri) ?: kotlin.error("Unable to read one of the selected files.")
                        val remaining = maxBytes - total
                        val bytes = input.use { stream ->
                            val outputStream = java.io.ByteArrayOutputStream()
                            val buffer = ByteArray(64 * 1024)
                            while (true) {
                                val read = stream.read(buffer)
                                if (read < 0) break
                                total += read
                                require(total <= maxBytes && read <= remaining) { "Combined input size must not exceed 100 MB." }
                                outputStream.write(buffer, 0, read)
                            }
                            outputStream.toByteArray()
                        }
                        NativeAudioWavProcessor.process(bytes, "inspector")
                        NativeAudioJoinInput(uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "audio.wav", bytes)
                    }
                }
            }.fold({ selected ->
                if (selected.size < 2) { files = selected; output = ""; error = "Select at least two WAV files to join." }
                else { files = selected; output = "Selected ${selected.size} WAV files. Use the arrows to set playback order."; error = "" }
            }, { caught -> files = emptyList(); output = ""; error = caught.message ?: "Unable to open selected WAV files." })
        }
    }
    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("audio/wav")) { uri ->
        val payload = pendingExport
        if (uri != null && payload != null) scope.launch {
            runCatching { withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(payload) } ?: kotlin.error("Unable to open the destination for writing.") } }
                .fold({ output += "\nJoined WAV saved to the selected location."; error = "" }, { error = it.message ?: "Unable to save joined WAV." })
            pendingExport = null
        } else pendingExport = null
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF101923))) { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text("⇄", style = MaterialTheme.typography.headlineLarge, color = Color(0xFF67E8F9))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("enV · AUDIO TOOLS", style = MaterialTheme.typography.labelSmall, color = Color(0xFF67E8F9))
                Text(toolName, style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text("Arrange · Join · Export WAV", style = MaterialTheme.typography.bodySmall, color = Color(0xFFCBD5E1))
            }
        } }
        TextButton(onClick = { showJoinerNotes = !showJoinerNotes }, modifier = Modifier.height(40.dp)) { Text(if (showJoinerNotes) "Hide file requirements" else "File requirements") }
        if (showJoinerNotes) Text("Join 2–32 local PCM WAV files. Inputs must share the same sample rate and channel count. Combined source size is capped at 100 MB; output is 16-bit PCM WAV and stays on this device.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = { openLauncher.launch(arrayOf("audio/wav", "audio/x-wav", "application/octet-stream")) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Choose WAV files") }
        files.forEachIndexed { index, file ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Text("${index + 1}. ${file.name}", modifier = Modifier.weight(1f), maxLines = 2)
                TextButton(onClick = { if (index > 0) { val changed = files.toMutableList(); val item = changed.removeAt(index); changed.add(index - 1, item); files = changed } }, enabled = index > 0) { Text("↑") }
                TextButton(onClick = { if (index < files.lastIndex) { val changed = files.toMutableList(); val item = changed.removeAt(index); changed.add(index + 1, item); files = changed } }, enabled = index < files.lastIndex) { Text("↓") }
                TextButton(onClick = { files = files.filterIndexed { i, _ -> i != index }; output = "" }) { Text("Remove") }
            }
        }
        ActionRow(onRun = {
            if (files.size < 2) { error = "Choose at least two compatible WAV files."; output = "" }
            else scope.launch {
                runCatching { withContext(Dispatchers.Default) { NativeAudioWavProcessor.join(files.map { it.bytes }) } }
                    .fold({ result -> output = result.report; error = ""; pendingExport = result.outputWav; saveLauncher.launch("env-joined-audio.wav") }, { caught -> output = ""; error = caught.message ?: "Unable to join WAV files." })
            }
        }, onReset = { files = emptyList(); output = ""; error = ""; pendingExport = null })
        ResultBox(output, error, { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV audio output", it)) })
    }
}

/**
 * App-private, short-lived handoff for the last source selected by a native WAV tool.
 * The file never leaves the app sandbox. It is a convenience cache, not a backup;
 * it expires after seven days and can be cleared explicitly by the user.
 */
private object NativeAudioSessionStore {
    data class Source(val name: String, val bytes: ByteArray)
    private const val PREFS = "env_audio_local_session"
    private const val KEY_NAME = "name"
    private const val KEY_SAVED_AT = "saved_at"
    private const val FILE_NAME = "env-recent-audio-source.wav"
    private const val MAX_BYTES = 250L * 1024 * 1024
    private const val TTL_MILLIS = 7L * 24 * 60 * 60 * 1000

    private fun file(context: android.content.Context) = java.io.File(context.filesDir, FILE_NAME)
    private fun prefs(context: android.content.Context) = context.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)

    fun hasAvailable(context: android.content.Context): Boolean {
        val savedAt = prefs(context).getLong(KEY_SAVED_AT, 0L)
        if (savedAt <= 0L || System.currentTimeMillis() - savedAt >= TTL_MILLIS || !file(context).isFile) {
            if (savedAt > 0L) clear(context)
            return false
        }
        val usable = file(context).length() in 44L..MAX_BYTES && prefs(context).getString(KEY_NAME, null) != null
        if (!usable) clear(context)
        return usable
    }

    fun save(context: android.content.Context, name: String, bytes: ByteArray): Boolean = runCatching {
        require(bytes.size in 44..MAX_BYTES.toInt()) { "Only WAV files up to 250 MB can be kept for native handoff." }
        val target = file(context)
        val temp = java.io.File(context.filesDir, "$FILE_NAME.tmp")
        java.io.FileOutputStream(temp).use { output -> output.write(bytes); output.fd.sync() }
        if (!temp.renameTo(target)) {
            temp.copyTo(target, overwrite = true)
            temp.delete()
        }
        prefs(context).edit().putString(KEY_NAME, name).putLong(KEY_SAVED_AT, System.currentTimeMillis()).apply()
    }.isSuccess

    fun load(context: android.content.Context): Source? {
        if (!hasAvailable(context)) return null
        val bytes = file(context).readBytes()
        val name = prefs(context).getString(KEY_NAME, null) ?: return null
        if (bytes.size !in 44..MAX_BYTES.toInt()) { clear(context); return null }
        return Source(name, bytes)
    }

    fun clear(context: android.content.Context) {
        file(context).delete()
        java.io.File(context.filesDir, "$FILE_NAME.tmp").delete()
        prefs(context).edit().remove(KEY_NAME).remove(KEY_SAVED_AT).apply()
    }
}

@Composable
private fun NativeAudioWaveFileToolForm(operation: String, toolName: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedBytes by remember(operation) { mutableStateOf<ByteArray?>(null) }
    var selectedName by remember(operation) { mutableStateOf("") }
    var pendingExport by remember { mutableStateOf<ByteArray?>(null) }
    var output by remember(operation) { mutableStateOf("") }
    var error by remember(operation) { mutableStateOf("") }
    var sessionNotice by remember(operation) { mutableStateOf("") }
    var showFormatNotes by rememberSaveable(operation) { mutableStateOf(false) }
    var startSeconds by rememberSaveable(operation) { mutableStateOf("0") }
    var endSeconds by rememberSaveable(operation) { mutableStateOf("5") }
    var gainPercent by rememberSaveable(operation) { mutableStateOf("100") }
    var semitones by rememberSaveable(operation) { mutableStateOf("2") }
    var playbackRate by rememberSaveable(operation) { mutableStateOf("0.8") }
    var targetSampleRate by rememberSaveable(operation) { mutableStateOf("48000") }
    var noiseStrength by rememberSaveable(operation) { mutableStateOf("0.8") }
    var gateThreshold by rememberSaveable(operation) { mutableStateOf("-42") }
    var humFrequency by rememberSaveable(operation) { mutableStateOf("50") }
    var silenceThreshold by rememberSaveable(operation) { mutableStateOf("-50") }
    var fadeMs by rememberSaveable(operation) { mutableStateOf("1000") }
    var eqLow by rememberSaveable(operation) { mutableStateOf("0") }
    var eqMid by rememberSaveable(operation) { mutableStateOf("0") }
    var eqHigh by rememberSaveable(operation) { mutableStateOf("0") }
    var compressorThreshold by rememberSaveable(operation) { mutableStateOf("-18") }
    var compressorRatio by rememberSaveable(operation) { mutableStateOf("4") }
    var targetChannels by rememberSaveable(operation) { mutableStateOf("2") }

    val openLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            runCatching {
                val bytes = withContext(Dispatchers.IO) {
                    val maxBytes = 250 * 1024 * 1024
                    val input = context.contentResolver.openInputStream(uri) ?: kotlin.error("Unable to read the selected file.")
                    input.use { stream ->
                        val outputStream = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(64 * 1024)
                        var total = 0
                        while (true) {
                            val read = stream.read(buffer)
                            if (read < 0) break
                            total += read
                            require(total <= maxBytes) { "Choose a WAV file no larger than 250 MB." }
                            outputStream.write(buffer, 0, read)
                        }
                        outputStream.toByteArray()
                    }
                }
                val info = NativeAudioWavProcessor.process(bytes, "inspector")
                selectedBytes = bytes
                selectedName = uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: "selected.wav"
                sessionNotice = if (NativeAudioSessionStore.save(context, selectedName, bytes)) "Source saved in this app's private storage for up to 7 days. It stays on this device." else "Source is ready in this tool, but the app could not save a reusable local handoff."
                endSeconds = info.durationSeconds?.let { String.format(Locale.US, "%.3f", it) } ?: "5"
                output = info.report
                error = ""
            }.onFailure { selectedBytes = null; selectedName = ""; output = ""; error = it.message ?: "Unable to open WAV." }
        }
    }
    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("audio/wav")) { uri ->
        val payload = pendingExport
        if (uri != null && payload != null) scope.launch {
            runCatching {
                withContext(Dispatchers.IO) { context.contentResolver.openOutputStream(uri)?.use { it.write(payload) } ?: kotlin.error("Unable to open the destination for writing.") }
            }.fold({ output += "\nSaved processed WAV to the selected location."; error = "" }, { error = it.message ?: "Unable to save WAV." })
            pendingExport = null
        } else pendingExport = null
    }

    fun restoreLastSource() {
        scope.launch {
            try {
                val stored = withContext(Dispatchers.IO) { NativeAudioSessionStore.load(context) } ?: error("There is no reusable local audio source. Select a WAV file first.")
                val info = withContext(Dispatchers.Default) { NativeAudioWavProcessor.process(stored.bytes, "inspector") }
                selectedBytes = stored.bytes; selectedName = stored.name
                endSeconds = info.durationSeconds?.let { String.format(Locale.US, "%.3f", it) } ?: "5"
                output = info.report; error = ""
                sessionNotice = "Restored ${stored.name} from this device's private local session. Nothing was uploaded."
            } catch (cause: Throwable) {
                error = cause.message ?: "Could not restore the saved local audio source."
                sessionNotice = "Choose the source file again if the local handoff is unavailable."
            }
        }
    }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV audio output", text)) }
    val analyzer = operation in setOf("inspector", "duration", "peak", "rms", "silence", "dc-offset", "audio-lufs-meter")
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF101923))) { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text("∿", style = MaterialTheme.typography.headlineLarge, color = Color(0xFF67E8F9))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("enV · AUDIO WORKSPACE", style = MaterialTheme.typography.labelSmall, color = Color(0xFF67E8F9))
                Text(toolName, style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text(if (analyzer) "Inspect · Measure · Review" else "Edit · Process · Export WAV", style = MaterialTheme.typography.bodySmall, color = Color(0xFFCBD5E1))
            }
        } }
        TextButton(onClick = { showFormatNotes = !showFormatNotes }, modifier = Modifier.height(40.dp)) { Text(if (showFormatNotes) "Hide file requirements" else "File requirements") }
        if (showFormatNotes) Text("Runs locally. Native editing supports PCM WAV (8/16/24/32-bit) and 32-bit float WAV. Use the browser-local tool for compressed inputs such as MP3, M4A, OGG or FLAC.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        Button(onClick = { openLauncher.launch(arrayOf("audio/wav", "audio/x-wav", "application/octet-stream")) }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (selectedName.isBlank()) "Choose WAV file" else "Choose another WAV · $selectedName") }
        if (sessionNotice.isNotBlank()) Text(sessionNotice, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        if (selectedBytes == null && NativeAudioSessionStore.hasAvailable(context)) OutlinedButton(onClick = { restoreLastSource() }, modifier = Modifier.fillMaxWidth()) { Text("Restore previous local source") }
        if (NativeAudioSessionStore.hasAvailable(context)) TextButton(onClick = { NativeAudioSessionStore.clear(context); sessionNotice = "Saved source removed from this device. Current in-memory selection is unchanged." }, modifier = Modifier.fillMaxWidth()) { Text("Forget saved source") }
        if (!analyzer) {
            when (operation) {
                "trim" -> { InputField(startSeconds, { startSeconds = it }, "Start (seconds)", singleLine = true); InputField(endSeconds, { endSeconds = it }, "End (seconds)", singleLine = true) }
                "volume-local" -> InputField(gainPercent, { gainPercent = it }, "Gain (percent, 0–500)", singleLine = true)
                "audio-pitch-shift" -> InputField(semitones, { semitones = it }, "Pitch change (semitones, −12 to +12; changes duration)", singleLine = true)
                "audio-tempo-change" -> InputField(playbackRate, { playbackRate = it }, "Playback speed (0.5–1.5; pitch changes too)", singleLine = true)
                "resample-local" -> InputField(targetSampleRate, { targetSampleRate = it }, "Target sample rate (8000–192000 Hz)", singleLine = true)
                "voice-noise-reducer" -> { InputField(noiseStrength, { noiseStrength = it }, "Noise reduction strength (0–1)", singleLine = true); InputField(gateThreshold, { gateThreshold = it }, "Soft-gate threshold (dBFS)", singleLine = true) }
                "voice-noise-gate" -> InputField(gateThreshold, { gateThreshold = it }, "Gate threshold (dBFS)", singleLine = true)
                "audio-hum-reducer" -> InputField(humFrequency, { humFrequency = it }, "Power-line frequency (50 or 60 Hz)", singleLine = true)
                "audio-trim-silence" -> InputField(silenceThreshold, { silenceThreshold = it }, "Silence threshold (dBFS)", singleLine = true)
                "fade-in", "fade-out" -> InputField(fadeMs, { fadeMs = it }, "Fade duration (milliseconds)", singleLine = true)
                "audio-compressor" -> { InputField(compressorThreshold, { compressorThreshold = it }, "Threshold (dBFS)", singleLine = true); InputField(compressorRatio, { compressorRatio = it }, "Ratio (1–20)", singleLine = true) }
                "audio-eq-simple" -> { InputField(eqLow, { eqLow = it }, "Low gain (dB)", singleLine = true); InputField(eqMid, { eqMid = it }, "Mid gain (dB)", singleLine = true); InputField(eqHigh, { eqHigh = it }, "High gain (dB)", singleLine = true) }
                "channels-local" -> InputField(targetChannels, { targetChannels = it }, "Output channels (1 mono or 2 stereo)", singleLine = true)
            }
        }
        ActionRow(
            onRun = {
                val data = selectedBytes
                if (data == null) { error = "Choose a WAV file first."; output = "" }
                else scope.launch {
                    runCatching {
                        withContext(Dispatchers.Default) {
                            NativeAudioWavProcessor.process(
                                bytes = data, operation = operation,
                                startSeconds = startSeconds.toDoubleOrNull() ?: 0.0,
                                endSeconds = endSeconds.toDoubleOrNull(),
                                gainPercent = gainPercent.toDoubleOrNull() ?: 100.0,
                                semitones = semitones.toDoubleOrNull() ?: 2.0,
                                playbackRate = playbackRate.toDoubleOrNull() ?: 1.0,
                                targetSampleRateHz = targetSampleRate.toIntOrNull() ?: 44100,
                                noiseStrength = noiseStrength.toDoubleOrNull() ?: 0.8,
                                gateThresholdDb = gateThreshold.toDoubleOrNull() ?: -42.0,
                                humFrequencyHz = humFrequency.toIntOrNull() ?: 50,
                                silenceThresholdDb = silenceThreshold.toDoubleOrNull() ?: -50.0,
                                fadeDurationMs = fadeMs.toDoubleOrNull() ?: 1000.0,
                                eqLowDb = eqLow.toDoubleOrNull() ?: 0.0, eqMidDb = eqMid.toDoubleOrNull() ?: 0.0, eqHighDb = eqHigh.toDoubleOrNull() ?: 0.0,
                                compressorThresholdDb = compressorThreshold.toDoubleOrNull() ?: -18.0,
                                compressorRatio = compressorRatio.toDoubleOrNull() ?: 4.0,
                                targetChannels = targetChannels.toIntOrNull() ?: 2,
                            )
                        }
                    }.fold({ result ->
                        output = result.report; error = ""
                        result.outputWav?.let { wav -> pendingExport = wav; saveLauncher.launch("${selectedName.substringBeforeLast('.', selectedName)}-enV.wav") }
                    }, { caught -> output = ""; error = caught.message ?: "Unable to process WAV." })
                }
            },
            onReset = { startSeconds = "0"; endSeconds = "5"; gainPercent = "100"; semitones = "2"; playbackRate = "0.8"; targetSampleRate = "48000"; noiseStrength = "0.8"; gateThreshold = "-42"; humFrequency = "50"; silenceThreshold = "-50"; fadeMs = "1000"; eqLow = "0"; eqMid = "0"; eqHigh = "0"; compressorThreshold = "-18"; compressorRatio = "4"; targetChannels = "2"; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeAudioGeneratorToolForm(operation: String, toolName: String) {
    val context = LocalContext.current
    var frequency by rememberSaveable(operation) { mutableStateOf("440") }
    var duration by rememberSaveable(operation) { mutableStateOf("2") }
    var waveform by rememberSaveable(operation) { mutableStateOf("sine") }
    var level by rememberSaveable(operation) { mutableStateOf("-12") }
    var sampleRate by rememberSaveable(operation) { mutableStateOf("44100") }
    var bpm by rememberSaveable(operation) { mutableStateOf("120") }
    var beatsPerBar by rememberSaveable(operation) { mutableStateOf("4") }
    var denominator by rememberSaveable(operation) { mutableStateOf("4") }
    var bars by rememberSaveable(operation) { mutableStateOf("4") }
    var pendingExport by remember { mutableStateOf<ByteArray?>(null) }
    var output by remember(operation) { mutableStateOf("") }
    var error by remember(operation) { mutableStateOf("") }
    var showToolNotes by rememberSaveable(operation) { mutableStateOf(false) }
    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("audio/wav")) { uri ->
        val payload = pendingExport
        if (uri != null && payload != null) {
            runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(payload) } ?: kotlin.error("Unable to open the destination for writing.") }
                .fold({ output += "\nSaved WAV to the selected location."; error = "" }, { error = it.message ?: "Unable to save generated audio." })
        }
        pendingExport = null
    }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV audio output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF101923))) { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth().padding(16.dp)) {
            Text(if (operation == "generate-tone") "∿" else "♩", style = MaterialTheme.typography.headlineLarge, color = Color(0xFF67E8F9))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("enV · AUDIO TOOLS", style = MaterialTheme.typography.labelSmall, color = Color(0xFF67E8F9))
                Text(toolName, style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text(if (operation == "generate-tone") "Shape · Frequency · Duration" else "Tempo · Meter · Click track", style = MaterialTheme.typography.bodySmall, color = Color(0xFFCBD5E1))
            }
        } }
        TextButton(onClick = { showToolNotes = !showToolNotes }, modifier = Modifier.height(40.dp)) { Text(if (showToolNotes) "Hide format details" else "Format details") }
        if (showToolNotes) Text("Generated on this device as 16-bit PCM WAV. No upload or account is required.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        InputField(sampleRate, { sampleRate = it }, "Sample rate (8000–192000 Hz)", singleLine = true)
        if (operation == "generate-tone") {
            InputField(waveform, { waveform = it.trim().lowercase() }, "Waveform: sine, square, saw or noise", singleLine = true)
            InputField(frequency, { frequency = it }, "Frequency (Hz, below Nyquist)", singleLine = true)
            InputField(duration, { duration = it }, "Duration (0.05–300 seconds)", singleLine = true)
            InputField(level, { level = it }, "Level (−60 to 0 dBFS)", singleLine = true)
        } else {
            InputField(bpm, { bpm = it }, "Quarter-note BPM (40–240)", singleLine = true)
            InputField(beatsPerBar, { beatsPerBar = it }, "Beats per bar (1–12)", singleLine = true)
            InputField(denominator, { denominator = it }, "Time-signature denominator: 2, 4 or 8", singleLine = true)
            InputField(bars, { bars = it }, "Bars (1–100)", singleLine = true)
        }
        ActionRow(onRun = {
            runCatching {
                if (operation == "generate-tone") NativeAudioWavProcessor.generateTone(sampleRate.toIntOrNull() ?: 44100, duration.toDoubleOrNull() ?: 2.0, frequency.toDoubleOrNull() ?: 440.0, waveform, level.toDoubleOrNull() ?: -12.0)
                else NativeAudioWavProcessor.generateMetronome(sampleRate.toIntOrNull() ?: 44100, bpm.toDoubleOrNull() ?: 120.0, beatsPerBar.toIntOrNull() ?: 4, bars.toIntOrNull() ?: 4, denominator.toIntOrNull() ?: 4)
            }.fold({ result -> output = result.report; error = ""; pendingExport = result.outputWav; saveLauncher.launch(if (operation == "generate-tone") "env-generated-tone.wav" else "env-metronome.wav") }, { caught -> output = ""; error = caught.message ?: "Unable to generate local audio." })
        }, onReset = { frequency = "440"; duration = "2"; waveform = "sine"; level = "-12"; sampleRate = "44100"; bpm = "120"; beatsPerBar = "4"; denominator = "4"; bars = "4"; output = ""; error = ""; pendingExport = null })
        ResultBox(output, error, ::copy)
    }
}

private const val NATIVE_AUDIO_RECORD_FALLBACK_SAMPLE_RATE = 44_100
private const val NATIVE_AUDIO_RECORD_MAX_SECONDS = 300

@Composable
private fun NativeAudioRecorderToolForm(toolName: String) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var audioRecord by remember { mutableStateOf<AudioRecord?>(null) }
    var recordingJob by remember { mutableStateOf<Job?>(null) }
    var stopRequested by remember { mutableStateOf<java.util.concurrent.atomic.AtomicBoolean?>(null) }
    var isRecording by rememberSaveable { mutableStateOf(false) }
    var levelPercent by rememberSaveable { mutableIntStateOf(0) }
    var elapsedSeconds by rememberSaveable { mutableIntStateOf(0) }
    var output by rememberSaveable { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf("") }
    var status by rememberSaveable { mutableStateOf("Ready. Recording starts only after microphone permission is granted.") }
    var pendingExport by remember { mutableStateOf<ByteArray?>(null) }
    val preferredSampleRate = remember {
        context.getSystemService(AudioManager::class.java)
            ?.getProperty(AudioManager.PROPERTY_OUTPUT_SAMPLE_RATE)
            ?.toIntOrNull()
            ?.takeIf { it in 8_000..192_000 }
            ?: NATIVE_AUDIO_RECORD_FALLBACK_SAMPLE_RATE
    }

    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("audio/wav")) { uri ->
        val payload = pendingExport
        if (uri != null && payload != null) scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(uri)?.use { it.write(payload) }
                        ?: kotlin.error("Unable to open the destination for writing.")
                }
            }.fold({ status = "Saved local microphone recording as 16-bit PCM WAV. No audio was uploaded."; output = "Duration: ${elapsedSeconds}s\nSample rate: ${preferredSampleRate.toString().replace(Regex("(?<=\\d)(?=(\\d{3})+$)"), ",")} Hz\nChannels: mono\nFormat: 16-bit PCM WAV\nPrivacy: recorded and exported on this device."; error = "" }, { error = it.message ?: "Unable to save the recording." })
            pendingExport = null
        } else pendingExport = null
    }

    fun startCapture() {
        if (isRecording || recordingJob?.isActive == true) return
        error = ""
        output = ""
        elapsedSeconds = 0
        levelPercent = 0
        val sampleRate = preferredSampleRate
        val maxBytes = sampleRate * 2 * NATIVE_AUDIO_RECORD_MAX_SECONDS
        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuffer <= 0) { error = "This device does not provide a supported ${sampleRate} Hz mono microphone input."; return }
        val recorder = runCatching {
            AudioRecord(MediaRecorder.AudioSource.MIC, sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minBuffer * 2, 8192))
        }.getOrElse { error = it.message ?: "Unable to initialize microphone capture."; return }
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release(); error = "The microphone recorder could not be initialized. Check that another app is not holding the microphone."; return
        }
        val stopFlag = java.util.concurrent.atomic.AtomicBoolean(false)
        stopRequested = stopFlag
        recordingJob = scope.launch(Dispatchers.IO) {
            val raw = java.io.ByteArrayOutputStream(minBuffer.coerceAtLeast(8192))
            try {
                recorder.startRecording()
                withContext(Dispatchers.Main.immediate) { audioRecord = recorder; isRecording = true; status = "Recording locally. Maximum duration: 5 minutes." }
                val shorts = ShortArray(2048)
                var lastUiUpdate = 0L
                val startedAt = android.os.SystemClock.elapsedRealtime()
                while (isActive && !stopFlag.get() && raw.size() < maxBytes) {
                    val read = recorder.read(shorts, 0, shorts.size, AudioRecord.READ_BLOCKING)
                    if (read < 0) {
                        if (stopFlag.get()) break
                        throw IllegalStateException("Microphone read failed (code $read). Stop and retry; no server upload was attempted.")
                    }
                    if (read == 0) continue
                    val writable = minOf(read, (maxBytes - raw.size()) / 2)
                    if (writable <= 0) break
                    var peak = 0.0
                    var sumSquares = 0.0
                    val block = ByteArray(writable * 2)
                    for (index in 0 until writable) {
                        val sample = shorts[index].toInt()
                        block[index * 2] = (sample and 0xff).toByte()
                        block[index * 2 + 1] = ((sample shr 8) and 0xff).toByte()
                        val normalized = sample / 32768.0
                        peak = maxOf(peak, kotlin.math.abs(normalized))
                        sumSquares += normalized * normalized
                    }
                    raw.write(block)
                    val now = android.os.SystemClock.elapsedRealtime()
                    if (now - lastUiUpdate >= 180) {
                        val seconds = raw.size() / (sampleRate * 2)
                        val rms = kotlin.math.sqrt(sumSquares / writable.coerceAtLeast(1))
                        val percent = (20 * kotlin.math.log10(maxOf(rms, 0.000001)) + 60).coerceIn(0.0, 60.0) / 60.0 * 100
                        withContext(Dispatchers.Main.immediate) {
                            elapsedSeconds = seconds
                            levelPercent = percent.toInt()
                            status = if (peak >= 0.999) "Recording — clipping risk detected. Reduce input level or move farther from the microphone." else "Recording locally · ${seconds}s elapsed · ${(NATIVE_AUDIO_RECORD_MAX_SECONDS - seconds).coerceAtLeast(0)}s remaining."
                        }
                        lastUiUpdate = now
                    }
                }
                runCatching { if (recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) recorder.stop() }
                val captured = raw.toByteArray()
                withContext(Dispatchers.Main.immediate) {
                    if (captured.isNotEmpty()) {
                        pendingExport = com.chastech.env.engine.NativePcmWavEncoder.encodeMonoPcm16Wav(captured, sampleRate, NATIVE_AUDIO_RECORD_MAX_SECONDS)
                        elapsedSeconds = captured.size / (sampleRate * 2)
                        status = if (stopFlag.get()) "Recording stopped and ready to export." else "Five-minute limit reached; recording is ready to export."
                        output = "Captured ${(captured.size / 1_000_000.0).let { String.format(Locale.US, "%.2f", it) }} MB of raw PCM\nDuration: ${elapsedSeconds}s\nFormat: ${sampleRate} Hz mono, 16-bit PCM WAV\nNo upload: audio remains on this device until you choose to export it."
                    } else status = "No audio samples were captured. Check microphone access and try again."
                    audioRecord = null
                    isRecording = false
                    recordingJob = null
                    stopRequested = null
                }
            } catch (caught: Throwable) {
                withContext(Dispatchers.Main.immediate) { error = caught.message ?: "Microphone recording failed."; status = "Recording failed. Check permission and microphone availability."; audioRecord = null; isRecording = false; recordingJob = null; stopRequested = null }
            } finally {
                runCatching { if (recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) recorder.stop() }
                recorder.release()
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startCapture() else { error = "Microphone permission was denied. Allow microphone access in Android settings to record audio."; status = "No recording started." }
    }
    fun requestStart() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) startCapture()
        else {
            status = "Microphone access is requested only for recording. Android will show a permission prompt; import and offline tools remain available if you deny it."
            permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    fun stopCapture() {
        stopRequested?.set(true)
        status = "Stopping and finalizing the local WAV…"
        runCatching { audioRecord?.stop() }
    }
    DisposableEffect(Unit) {
        onDispose {
            stopRequested?.set(true)
            runCatching { audioRecord?.stop() }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        Text(toolName, style = MaterialTheme.typography.titleMedium)
        Text("Native microphone recording · device-rate mono · 16-bit PCM WAV · maximum 5 minutes per take. Audio stays on device; export is initiated by you. Microphone permission is requested only when you press Start; wired headphones are recommended for monitoring.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(shape = CircleShape, color = if (isRecording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(12.dp)) {}
            Text(if (isRecording) "Recording" else "Stopped")
            Spacer(Modifier.weight(1f))
            Text("${elapsedSeconds}s / ${NATIVE_AUDIO_RECORD_MAX_SECONDS}s", style = MaterialTheme.typography.bodySmall)
        }
        androidx.compose.material3.LinearProgressIndicator(progress = { levelPercent / 100f }, modifier = Modifier.fillMaxWidth(), color = if (levelPercent >= 95) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
        Text("Input level (approximate RMS; clipping is shown in red)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            Button(onClick = { requestStart() }, enabled = !isRecording && recordingJob?.isActive != true, modifier = Modifier.weight(1f)) { Text("Start recording") }
            OutlinedButton(onClick = { stopCapture() }, enabled = isRecording, modifier = Modifier.weight(1f)) { Text("Stop") }
        }
        Button(onClick = { pendingExport?.let { saveLauncher.launch("env-microphone-recording.wav") } }, enabled = pendingExport != null, modifier = Modifier.fillMaxWidth()) { Text("Export WAV") }
        Text(status, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (output.isNotBlank() || error.isNotBlank()) ResultBox(output, error, { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV recording output", it)) })
    }
}

@Composable
private fun NativeAudioToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val operation = NativeAudioEngine.operationFor(tool) ?: return
    if (operation == "live-video-studio") { NativeMusicLiveVideoStudio(); return }
    if (operation == "music-studio") { NativeMusicStudio(); return }
    if (operation == "record-mic") {
        NativeAudioRecorderToolForm(tool.name)
        return
    }
    if (operation == "generate-tone" || operation == "generate-metronome") {
        NativeAudioGeneratorToolForm(operation, tool.name)
        return
    }
    if (operation == "file:joiner") {
        NativeAudioWavJoinerForm(tool.name)
        return
    }
    if (operation.startsWith("file:")) {
        NativeAudioWaveFileToolForm(operation.removePrefix("file:"), tool.name)
        return
    }
    val inferredPlatform = remember(tool.id) { listOf("podcast", "discord", "spotify", "instagram", "apple-music", "youtube", "tiktok", "twitch").firstOrNull { tool.id.startsWith("$it-") } ?: "podcast" }
    var platform by rememberSaveable(tool.id) { mutableStateOf(inferredPlatform) }
    var duration by rememberSaveable(tool.id) { mutableStateOf("180") }
    var bitrate by rememberSaveable(tool.id) { mutableStateOf("128") }
    var sampleRate by rememberSaveable(tool.id) { mutableStateOf("44100") }
    var channels by rememberSaveable(tool.id) { mutableStateOf("2") }
    var bits by rememberSaveable(tool.id) { mutableStateOf("16") }
    var bpm by rememberSaveable(tool.id) { mutableStateOf("120") }
    var bars by rememberSaveable(tool.id) { mutableStateOf("4") }
    var targetSizeMb by rememberSaveable(tool.id) { mutableStateOf("0.96") }
    var calcMode by rememberSaveable(tool.id) { mutableStateOf(if (tool.id == "audio-file-size-calculator") "file-size" else "bitrate") }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV audio output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("This native tool runs offline. Audio files and microphone access are not requested by these calculation/reference modes.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
        InputField(platform, { platform = it.trim().lowercase() }, "Platform (podcast, discord, spotify, instagram, apple-music, youtube, tiktok, twitch)", singleLine = true)
        if (operation == "calc") InputField(calcMode, { calcMode = it.trim().lowercase() }, "Calculation mode: bitrate, bitrate-from-size, file-size, pcm-size, BPM, sample-rate", singleLine = true)
        if (operation in setOf("bitrate", "file-size", "pcm-size", "duration") || (operation == "calc" && calcMode in setOf("bitrate", "file-size", "pcm-size", "duration", "bitrate-from-size"))) {
            InputField(duration, { duration = it }, "Duration (seconds)", singleLine = true)
            if (!(operation == "calc" && calcMode == "bitrate-from-size")) InputField(bitrate, { bitrate = it }, "Bitrate (kbps)", singleLine = true)
        }
        if (operation == "calc" && calcMode == "bitrate-from-size") InputField(targetSizeMb, { targetSizeMb = it }, "Target size (decimal MB)", singleLine = true)
        if (operation == "pcm-size" || (operation == "calc" && calcMode == "pcm-size")) {
            InputField(sampleRate, { sampleRate = it }, "Sample rate (Hz)", singleLine = true)
            InputField(channels, { channels = it }, "Channels", singleLine = true)
            InputField(bits, { bits = it }, "Bit depth", singleLine = true)
        }
        if (operation == "sample-rate" || (operation == "calc" && calcMode == "sample-rate")) InputField(sampleRate, { sampleRate = it }, "Sample rate (Hz)", singleLine = true)
        if (operation == "bpm" || (operation == "calc" && calcMode == "bpm")) {
            InputField(bpm, { bpm = it }, "BPM", singleLine = true)
            InputField(bars, { bars = it }, "Bars in 4/4", singleLine = true)
        }
        ActionRow(
            onRun = { runCatching {
                NativeAudioEngine.calculate(if (operation == "calc") calcMode else operation, platform, duration.toDouble(), bitrate.toDouble(), sampleRate.toDouble(), channels.toInt(), bits.toInt(), bpm.toDouble(), bars.toInt(), targetSizeMb.toDouble())
            }.fold({ output = it; error = "" }, { output = ""; error = it.message ?: "Unable to calculate audio values." }) },
            onReset = { duration = "180"; bitrate = "128"; sampleRate = "44100"; channels = "2"; bits = "16"; bpm = "120"; bars = "4"; targetSizeMb = "0.96"; calcMode = if (tool.id == "audio-file-size-calculator") "file-size" else "bitrate"; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeCalculatorToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val operation = NativeCalculatorEngine.operationForTool(tool.id) ?: return
    val values = remember(tool.id) { mutableStateMapOf<String, String>().apply { operation.fields.forEach { field -> put(field.name, field.defaultValue) } } }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val journal = remember { com.chastech.env.billing.OfflineWalletJournal(context) }
    fun render(rows: List<NativeCalculatorEngine.Output>) = rows.joinToString("\n") { row -> "${row.label}: ${row.value}${row.hint?.let { " $it" } ?: ""}" }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        operation.formula?.takeIf { it.isNotBlank() }?.let { Text("Formula: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        operation.fields.forEach { field -> InputField(values[field.name].orEmpty(), { values[field.name] = it }, field.label, singleLine = true) }
        ActionRow(
            onRun = {
                val allowanceId = runCatching { journal.activeAllowanceId() }.getOrNull()
                val metered = allowanceId != null && runCatching { journal.isEligibleTool(context, tool.id) }.getOrDefault(false)
                if (!metered || allowanceId == null) {
                    runCatching { NativeCalculatorEngine.run(operation, values.toMap()) }.fold(
                        { rows -> output = render(rows); error = "" },
                        { output = ""; error = it.message ?: "Unable to run calculator" }
                    )
                } else scope.launch {
                    var ticket: com.chastech.env.billing.OfflineWalletJournal.OperationTicket? = null
                    try {
                        // Validate and compute before reserving a billable journal ticket so
                        // invalid input does not consume offline tokens. Do not display the
                        // prepared result until the successful Calculate action is journaled.
                        val rows = NativeCalculatorEngine.run(operation, values.toMap())
                        val operationTicket = journal.beginOperation(context, allowanceId, tool.id)
                        ticket = operationTicket
                        journal.finishOperation(context, operationTicket, "succeeded")
                        output = render(rows); error = ""
                        if (com.chastech.env.billing.OfflineWalletNativeApi.isPaired(context)) {
                            runCatching { com.chastech.env.billing.OfflineWalletNativeApi.synchronize(context, journal, allowanceId) }
                        }
                    } catch (failure: Exception) {
                        val journalMessage = ticket?.let { operationTicket ->
                            runCatching { journal.finishOperation(context, operationTicket, "failed") }.exceptionOrNull()?.message
                        }
                        output = ""
                        error = listOfNotNull(failure.message ?: "Unable to run calculator", journalMessage?.let { "Usage record needs recovery: $it" }).joinToString(" ")
                        if (ticket != null && com.chastech.env.billing.OfflineWalletNativeApi.isPaired(context)) {
                            runCatching { com.chastech.env.billing.OfflineWalletNativeApi.synchronize(context, journal, allowanceId) }
                        }
                    }
                }
            },
            onReset = { operation.fields.forEach { values[it.name] = it.defaultValue }; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeExpansionCalculatorToolForm(toolId: String) {
    val context = LocalContext.current
    val op = NativeExpansionCalculatorEngine.operationForTool(toolId) ?: return
    var aText by rememberSaveable(toolId) { mutableStateOf("2") }
    var bText by rememberSaveable(toolId) { mutableStateOf("3") }
    var cText by rememberSaveable(toolId) { mutableStateOf("6") }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    val target = op.target
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("${op.row.cLabel} = ${op.row.aLabel} ${when(op.row.family) { "product" -> "×"; "ratio" -> "÷"; else -> "+" }} ${op.row.bLabel}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal)
        if (target != 'a') InputField(aText, { aText = it }, op.row.aLabel, singleLine = true)
        if (target != 'b') InputField(bText, { bText = it }, op.row.bLabel, singleLine = true)
        if (target != 'c') InputField(cText, { cText = it }, op.row.cLabel, singleLine = true)
        ActionRow(
            onRun = { runCatching {
                val map = mapOf('a' to aText, 'b' to bText, 'c' to cText)
                NativeExpansionCalculatorEngine.run(op, map)
            }.fold({ output = "${it.first}: ${it.second}"; error = "" }, { output = ""; error = it.message ?: "Unable to run calculator" }) },
            onReset = { aText = "2"; bText = "3"; cText = "6"; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeMathExerciseToolForm(toolId: String) {
    val context = LocalContext.current
    val op = NativeMathExerciseEngine.operationForTool(toolId) ?: return
    var values by remember(toolId) { mutableStateOf(op.fields.associate { it.name to "1" }) }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(op.formula, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal)
        op.fields.forEach { field -> InputField(values[field.name].orEmpty(), { next -> values = values.toMutableMap().apply { put(field.name, next) } }, field.label, singleLine = true) }
        ActionRow(
            onRun = { runCatching { NativeMathExerciseEngine.run(op, values) }.fold({ rows -> output = rows.joinToString("\n") { row -> "${row.label}: ${row.value}${row.hint?.let { " $it" } ?: ""}" }; error = "" }, { output = ""; error = it.message ?: "Unable to run calculator" }) },
            onReset = { values = op.fields.associate { it.name to "1" }; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeTextToolForm(toolId: String) {
    val context = LocalContext.current
    val op = NativeTextEngine.operationForTool(toolId) ?: return
    var input by rememberSaveable(toolId) { mutableStateOf("") }
    var compare by rememberSaveable(toolId) { mutableStateOf("") }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    var find by rememberSaveable(toolId) { mutableStateOf("") }
    var replacement by rememberSaveable(toolId) { mutableStateOf("") }
    var width by rememberSaveable(toolId) { mutableStateOf("80") }
    var style by rememberSaveable(toolId) { mutableStateOf("bullets") }
    var keyword by rememberSaveable(toolId) { mutableStateOf("") }
    var wpm by rememberSaveable(toolId) { mutableStateOf("200") }
    var limit by rememberSaveable(toolId) { mutableStateOf("280") }
    var dialect by rememberSaveable(toolId) { mutableStateOf("postgresql") }
    val counter = op.endsWith("counter") || op == "reading-time-calculator"
    val diff = op == "text-diff"
    val options = NativeTextEngine.Options(find, replacement, width, style, keyword, limit, wpm, dialect)
    val stats = NativeTextEngine.stats(input, wpm)
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (op == "find-replace") {
            InputField(find, { find = it }, "Find")
            InputField(replacement, { replacement = it }, "Replace with")
        }
        if (op == "wrap") InputField(width, { width = it }, "Column width", singleLine = true)
        if (op == "list") {
            Text("Style", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("bullets", "numbered", "comma").forEach { value -> FilterChip(selected = style == value, onClick = { style = value }, label = { Text(value.replaceFirstChar { it.uppercase() }) }) } }
        }
        if (op == "keyword-density") InputField(keyword, { keyword = it }, "Keyword (optional)")
        if (op == "sql-format") {
            Text("SQL dialect", style = MaterialTheme.typography.labelLarge)
            var dialectMenuExpanded by remember(toolId) { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { dialectMenuExpanded = true }) { Text(dialect.uppercase().replace("TRANSACTSQL", "T-SQL")) }
                DropdownMenu(expanded = dialectMenuExpanded, onDismissRequest = { dialectMenuExpanded = false }) {
                    listOf("sql", "postgresql", "mysql", "mariadb", "sqlite", "transactsql", "bigquery", "snowflake", "oracle", "redshift", "duckdb").forEach { item ->
                        DropdownMenuItem(text = { Text(item.uppercase().replace("TRANSACTSQL", "T-SQL")) }, onClick = { dialect = item; dialectMenuExpanded = false })
                    }
                }
            }
            Text("Local lexer-based formatting; not a full grammar parser or query validator.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        InputField(input, { input = it }, if (counter) "Text" else "Input", minLines = 5, tall = true)
        if (diff) InputField(compare, { compare = it }, "New text", minLines = 5, tall = true)
        if (op == "reading-time-calculator") InputField(wpm, { wpm = it }, "Reading speed (words/min)", singleLine = true)
        if (op == "word-counter" || op == "character-counter") InputField(limit, { limit = it }, "Target limit", singleLine = true)
        if (counter) {
            Text("${stats.words} words · ${stats.characters} characters · ${stats.sentences} sentences · ${stats.paragraphs} paragraphs", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Normal)
            Text("${if (op == "word-counter") stats.words else if (op == "character-counter") stats.characters else if (op == "sentence-counter") stats.sentences else if (op == "paragraph-counter") stats.paragraphs else stats.readingMinutes} ${if (op == "reading-time-calculator") "min" else "matched"} · ${stats.readingMinutes} min reading time", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        ActionRow(
            onRun = { runCatching { NativeTextEngine.run(toolId, input, compare, options) }.fold({ output = it; error = "" }, { output = ""; error = it.message ?: "Unable to run tool" }) },
            onReset = { input = ""; compare = ""; output = ""; error = ""; find = ""; replacement = ""; width = "80"; style = "bullets"; keyword = ""; wpm = "200"; limit = "280"; dialect = "postgresql" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeCodecToolForm(toolId: String) {
    val context = LocalContext.current
    val op = NativeCodecEngine.operationForTool(toolId) ?: return
    var input by rememberSaveable(toolId) { mutableStateOf(if (op == "base-convert") "255" else "Hello, enV!") }
    var a by rememberSaveable(toolId) { mutableStateOf("hello") }
    var b by rememberSaveable(toolId) { mutableStateOf("hello") }
    var value by rememberSaveable(toolId) { mutableStateOf("255") }
    var fromBase by rememberSaveable(toolId) { mutableStateOf("10") }
    var toBase by rememberSaveable(toolId) { mutableStateOf("16") }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when (op) {
            "hash-compare" -> { InputField(a, { a = it }, "Hash or value A"); InputField(b, { b = it }, "Hash or value B") }
            "base-convert" -> { InputField(value, { value = it }, "Value", placeholder = "255 or ff"); Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { InputField(fromBase, { fromBase = it }, "From base", singleLine = true, modifier = Modifier.weight(1f)); InputField(toBase, { toBase = it }, "To base", singleLine = true, modifier = Modifier.weight(1f)) } }
            else -> InputField(input, { input = it }, "Input", placeholder = "Enter text to convert", minLines = 5, tall = true)
        }
        ActionRow(
            onRun = {
                val options = when (op) { "hash-compare" -> mapOf("a" to a, "b" to b); "base-convert" -> mapOf("value" to value, "fromBase" to fromBase, "toBase" to toBase); else -> emptyMap() }
                runCatching { NativeCodecEngine.run(toolId, input, options) }.fold({ output = it.output; error = "" }, { output = ""; error = it.message ?: "Unable to run codec" })
            },
            onReset = { input = if (op == "base-convert") "255" else "Hello, enV!"; a = "hello"; b = "hello"; value = "255"; fromBase = "10"; toBase = "16"; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeColorToolForm(toolId: String) {
    val context = LocalContext.current
    val op = NativeColorEngine.operationForTool(toolId) ?: return
    var input by rememberSaveable(toolId) { mutableStateOf("#0D9F8A") }
    var foreground by rememberSaveable(toolId) { mutableStateOf("#16181D") }
    var background by rememberSaveable(toolId) { mutableStateOf("#FFFFFF") }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    var paletteText by rememberSaveable(toolId) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    fun runColor(value: String = input) {
        runCatching { NativeColorEngine.run(toolId, value, foreground, background) }.fold({ result -> output = result.output; paletteText = result.palette.joinToString(","); error = "" }, { error = it.message ?: "Unable to read color"; output = ""; paletteText = "" })
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (op == "contrast") { InputField(foreground, { foreground = it }, "Foreground", placeholder = "#16181D"); InputField(background, { background = it }, "Background", placeholder = "#FFFFFF") }
        else InputField(input, { input = it }, if (op == "palette") "Base color / palette input" else "Color input", placeholder = "#0D9F8A")
        ActionRow(
            onRun = { runColor() },
            onReset = { input = "#0D9F8A"; foreground = "#16181D"; background = "#FFFFFF"; output = ""; error = ""; paletteText = "" }
        )
        if (paletteText.isNotEmpty()) {
            Text("Palette swatches · tap to apply", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                paletteText.split(',').filter(String::isNotBlank).forEach { swatch ->
                    val parsed = runCatching { NativeColorEngine.parseHex(swatch) }.getOrNull()
                    val swatchColor = parsed?.let { Color(it.r / 255f, it.g / 255f, it.b / 255f) } ?: MaterialTheme.colorScheme.onSurfaceVariant
                    AssistChip(onClick = { input = swatch; runColor(swatch) }, label = { Text(swatch) }, leadingIcon = { Box(Modifier.size(16.dp).background(swatchColor, RoundedCornerShape(4.dp))) })
                }
            }
        }
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeDateTimeToolForm(toolId: String) {
    val context = LocalContext.current
    val op = NativeDateTimeEngine.operationForTool(toolId) ?: return
    val today = remember(toolId) { LocalDate.now().toString() }
    val now = remember(toolId) { Instant.now() }
    var input by rememberSaveable(toolId) { mutableStateOf(today) }
    var from by rememberSaveable(toolId) { mutableStateOf(today) }
    var to by rememberSaveable(toolId) { mutableStateOf(today) }
    var start by rememberSaveable(toolId) { mutableStateOf(today) }
    var days by rememberSaveable(toolId) { mutableStateOf("5") }
    var target by rememberSaveable(toolId) { mutableStateOf(now.plusSeconds(3600).toString()) }
    var zones by rememberSaveable(toolId) { mutableStateOf("UTC\nAmerica/New_York\nAsia/Tokyo") }
    var time by rememberSaveable(toolId) { mutableStateOf(now.toString()) }
    var toTz by rememberSaveable(toolId) { mutableStateOf("America/Los_Angeles") }
    var value by rememberSaveable(toolId) { mutableStateOf(now.epochSecond.toString()) }
    var pattern by rememberSaveable(toolId) { mutableStateOf("yyyy-MM-dd") }
    var year by rememberSaveable(toolId) { mutableStateOf("2024") }
    var birth by rememberSaveable(toolId) { mutableStateOf("1990-01-01") }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when (op) {
            "date-diff", "business-days" -> { InputField(from, { from = it }, "From", placeholder = "YYYY-MM-DD"); InputField(to, { to = it }, "To", placeholder = "YYYY-MM-DD") }
            "workday" -> { InputField(start, { start = it }, "Workday start", placeholder = "YYYY-MM-DD"); InputField(days, { days = it }, "Business days to add", singleLine = true) }
            "countdown" -> InputField(target, { target = it }, "Target date and time", placeholder = "ISO-8601")
            "world-clock" -> InputField(zones, { zones = it }, "IANA time zones", placeholder = "UTC, Europe/London", minLines = 3, tall = true)
            "timezone" -> { InputField(time, { time = it }, "Time", placeholder = "ISO-8601"); InputField(toTz, { toTz = it }, "Convert to time zone", placeholder = "UTC") }
            "unix" -> InputField(value, { value = it }, "Date or Unix timestamp", placeholder = "1710000000 or ISO-8601")
            "format" -> { InputField(value, { value = it }, "Date", placeholder = "ISO-8601"); InputField(pattern, { pattern = it }, "Pattern", placeholder = "yyyy-MM-dd") }
            "weekday", "week-number" -> InputField(value, { value = it }, "Date", placeholder = "ISO-8601")
            "leap" -> InputField(year, { year = it }, "Year", singleLine = true)
            "birthday" -> InputField(birth, { birth = it }, "Birth date", placeholder = "YYYY-MM-DD")
            "time-until", "deadline" -> InputField(target, { target = it }, "Target date", placeholder = "YYYY-MM-DD")
            else -> InputField(input, { input = it }, "Input", placeholder = "YYYY-MM-DD")
        }
        ActionRow(
            onRun = {
                val options = when (op) {
                    "date-diff", "business-days" -> mapOf("from" to from, "to" to to)
                    "workday" -> mapOf("start" to start, "days" to days)
                    "countdown", "time-until", "deadline" -> mapOf("target" to target)
                    "world-clock" -> mapOf("zones" to zones)
                    "timezone" -> mapOf("time" to time, "toTz" to toTz)
                    "unix", "weekday", "week-number", "format" -> if (op == "format") mapOf("value" to value, "pattern" to pattern) else mapOf("value" to value)
                    "leap" -> mapOf("year" to year)
                    "birthday" -> mapOf("birth" to birth)
                    else -> emptyMap()
                }
                runCatching { NativeDateTimeEngine.run(toolId, input, options) }.fold({ output = it.output; error = "" }, { output = ""; error = it.message ?: "Unable to run date/time tool" })
            },
            onReset = { input = today; from = today; to = today; start = today; days = "5"; target = now.plusSeconds(3600).toString(); zones = "UTC\nAmerica/New_York\nAsia/Tokyo"; time = now.toString(); toTz = "America/Los_Angeles"; value = now.epochSecond.toString(); pattern = "yyyy-MM-dd"; year = "2024"; birth = "1990-01-01"; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeMimeToolForm(toolId: String) {
    val context = LocalContext.current
    if (NativeMimeEngine.operationForTool(toolId) == null) return
    val scope = rememberCoroutineScope()
    var query by rememberSaveable(toolId) { mutableStateOf("") }
    var fileName by rememberSaveable(toolId) { mutableStateOf("") }
    var browserMime by rememberSaveable(toolId) { mutableStateOf("") }
    var bytesHex by rememberSaveable(toolId) { mutableStateOf("") }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
    var error by rememberSaveable(toolId) { mutableStateOf("") }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                try {
                    val selected = withContext(Dispatchers.IO) {
                        val resolver = context.contentResolver
                        var displayName = ""
                        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                            if (cursor.moveToFirst()) {
                                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                                if (index >= 0) displayName = cursor.getString(index).orEmpty()
                            }
                        }
                        val mime = resolver.getType(uri).orEmpty()
                        val bytes = ByteArray(64)
                        val count = resolver.openInputStream(uri)?.use { stream ->
                            var total = 0
                            while (total < bytes.size) {
                                val read = stream.read(bytes, total, bytes.size - total)
                                if (read <= 0) break
                                total += read
                            }
                            total
                        } ?: 0
                        Triple(displayName, mime, bytes.copyOf(count).joinToString(" ") { (it.toInt() and 0xff).toString(16).padStart(2, '0') })
                    }
                    fileName = selected.first
                    browserMime = selected.second
                    bytesHex = selected.third
                    error = ""
                } catch (exception: Exception) {
                    error = exception.message ?: "Unable to read the selected file."
                }
            }
        }
    }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        InputField(query, { query = it }, "Search extension, MIME, or format", placeholder = "pdf or image")
        Text("Optional file inspection", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(onClick = { picker.launch(arrayOf("*/*")) }) { Text("Choose local file") }
            if (fileName.isNotBlank()) Text(fileName, color = MaterialTheme.colorScheme.primary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        }
        InputField(fileName, { fileName = it }, "Filename", placeholder = "report.pdf")
        InputField(browserMime, { browserMime = it }, "Declared MIME (optional)", placeholder = "application/pdf")
        InputField(bytesHex, { bytesHex = it }, "Byte hex (optional)", placeholder = "25 50 44 46", minLines = 2)
        ActionRow(
            onRun = {
                val options = buildMap {
                    if (query.isNotBlank()) put("query", query)
                    if (fileName.isNotBlank()) put("fileName", fileName)
                    if (browserMime.isNotBlank()) put("browserMime", browserMime)
                    if (bytesHex.isNotBlank()) put("bytesHex", bytesHex)
                }
                runCatching { NativeMimeEngine.run(toolId, query, options) }.fold({ output = it.output; error = "" }, { output = ""; error = it.message ?: "Unable to run MIME lookup" })
            },
            onReset = { query = ""; fileName = ""; browserMime = ""; bytesHex = ""; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

@Composable
private fun NativeUtilityToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val op = tool.engine.extras["op"] ?: tool.engine.id
    var input by rememberSaveable(tool.id) { mutableStateOf("") }
    var options by rememberSaveable(tool.id) { mutableStateOf("{}") }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Native ${tool.engine.type} engine · op ${op ?: tool.id}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal)
        Text("Uses the catalog engine.op contract. Input is optional; structured parameters are supplied as JSON to preserve the web engine’s flexible option model.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        InputField(input, { input = it }, "Input", minLines = if (tool.engine.type == "generator") 2 else 4, tall = tool.engine.type != "generator")
        InputField(options, { options = it }, "Options JSON", minLines = 4, tall = true, placeholder = "{\"count\": 5, \"text\": \"hello\"}")
        ActionRow(
            onRun = { runCatching { NativeUtilityEngine.run(tool, input, options) }.fold({ output = it.text; error = "" }, { output = ""; error = it.message ?: "Unable to run native utility" }) },
            onReset = { input = ""; options = "{}"; output = ""; error = "" }
        )
        ResultBox(output, error, ::copy)
    }
}

internal object NativeDeveloperToolFormPolicy {
    fun needsSecondInput(op: String): Boolean = listOf("diff", "regex", "replace", "compare", "json-path", "jsonpath", "uuid-generator", "uuid-batch", "http-request-builder").any { op.lowercase().contains(it) }
    fun needsRegexFlags(op: String): Boolean = op.contains("regex", ignoreCase = true)
    fun needsReplacement(op: String): Boolean = op.contains("regex-replace", ignoreCase = true)
    fun isFileHash(op: String): Boolean = op.contains("file-hash", ignoreCase = true)
    fun actionLabel(op: String): String = when {
        op.contains("formatter", true) || op.contains("beautifier", true) -> "Format"
        op.contains("minifier", true) -> "Minify"
        op.contains("validator", true) -> "Validate"
        op.contains("regex-tester", true) -> "Test pattern"
        op.contains("encoder", true) -> "Encode"
        op.contains("decoder", true) -> "Decode"
        op.contains("generator", true) || op.contains("builder", true) -> "Generate"
        op.contains("parser", true) -> "Parse"
        op.contains("diff", true) || op.contains("compare", true) -> "Compare"
        op.contains("explainer", true) -> "Explain"
        op.contains("hash", true) -> "Calculate hash"
        else -> "Run"
    }
    fun example(op: String): Pair<String, String> {
        val value = op.lowercase(Locale.US)
        val uuid = "550e8400-e29b-41d4-a716-446655440000"
        val sha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        val jwt = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJleGFtcGxlIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9."
        return when {
            value == "developer-recipe-runner" -> JSONObject().put("input", "  <p>Hello   <strong>enV</strong> 🚀</p>\r\n").put("steps", JSONArray()
                .put(JSONObject().put("name", "Normalize line endings").put("op", "normalize-newlines"))
                .put(JSONObject().put("name", "Remove paragraph tag").put("op", "replace-literal").put("find", "<p>").put("replacement", ""))
                .put(JSONObject().put("name", "Remove closing paragraph tag").put("op", "replace-literal").put("find", "</p>").put("replacement", ""))
                .put(JSONObject().put("name", "Collapse whitespace").put("op", "collapse-whitespace"))
                .put(JSONObject().put("name", "Trim").put("op", "trim"))).toString() to ""
            value.contains("file-hash") -> "" to ""
            value.contains("json-path") || value.contains("jsonpath") -> "{\"user\":{\"name\":\"Ada\"},\"items\":[{\"id\":1},{\"id\":2}]}" to "$.items[0].id"
            value.contains("json-diff") -> "{\"name\":\"Ada\",\"active\":true}" to "{\"name\":\"Ada Lovelace\",\"active\":true}"
            value.contains("json") && value.endsWith("-decoder") -> "eyJuYW1lIjoiQWRhIiwiaXRlbXMiOlsxLDJdfQ==" to ""
            value.contains("hash-compare") || value.contains("hash-diff") -> sha256 to sha256
            value.endsWith("-diff") -> "before\nold-value\n" to "after\nnew-value\n"
            value.contains("json") -> "{\"name\":\"Ada\",\"items\":[1,2],\"active\":true}" to ""
            value.contains("query-string-parser") || value.contains("query-parser") -> "q=one&q=two&space=hello+world" to ""
            value.contains("query-string-builder") || value.contains("url-query-builder") -> "{\"q\":\"hello world\",\"tag\":[\"a\",\"b\"]}" to ""
            value.contains("developer-sql-query-builder") || value.contains("sql-query-builder") -> "{\"table\":\"users\",\"columns\":[\"id\",\"email\"],\"filters\":[{\"column\":\"active\",\"operator\":\"=\",\"value\":true}],\"limit\":25}" to ""
            value.contains("graphql-variables-builder") -> "{\"id\":\"example-123\",\"active\":true}" to ""
            value.contains("graphql-query-builder") -> "Example" to ""
            value.contains("api-mock-response") -> "{\"id\":\"example-1\",\"message\":\"Mock response\"}" to ""
            value.contains("webhook") && (value.contains("generator") || value.contains("builder")) -> "order.paid" to ""
            value.contains("jwt-claim-builder") || value.contains("jwt-payload-generator") || value == "jwt-encoder" || value == "jwt-generator" -> "{\"sub\":\"example-user\",\"iat\":1700000000,\"exp\":4102444800}" to ""
            value.contains("jwt") -> jwt to ""
            value.contains("regex-replace") -> "\\bcat\\b" to "cat CAT catalog"
            value.contains("regex") -> "\\bcat\\b" to "A cat, a CAT, and a catalog."
            value.contains("cron") && value.endsWith("-decoder") -> "Ki8xNSAqICogKiAq" to ""
            value.contains("cron") -> "*/15 * * * *" to ""
            value.contains("timestamp") || value.contains("epoch") -> "1700000000" to ""
            value.contains("uuid-generator") || value.contains("uuid-batch-generator") -> "" to "10"
            value.contains("uuid-decoder") -> uuid.replace("-", "") to ""
            value.contains("uuid") -> uuid to ""
            value.contains("hash-compare") || value.contains("hash-diff") -> sha256 to sha256
            value.contains("hash-decoder") -> sha256 to ""
            value.contains("hash") && listOf("validator", "tester", "formatter", "beautifier", "minifier", "parser", "inspector").any { value.endsWith("-$it") } -> sha256 to ""
            value.contains("hash") -> "hello" to ""
            value.contains("base64") && listOf("decoder", "formatter", "beautifier", "minifier", "converter", "parser", "inspector", "preview", "validator", "tester").any { value.endsWith("-$it") } -> "SGk=" to ""
            value.contains("base64") -> "enV 🚀 — local and private" to ""
            value.contains("ascii") && listOf("decoder", "validator", "tester", "parser").any { value.endsWith("-$it") } -> "72 105" to ""
            value.contains("ascii") -> "Hello" to ""
            value.contains("binary") && listOf("decoder", "validator", "tester", "parser").any { value.endsWith("-$it") } -> "01001000 01101001" to ""
            value.contains("binary") -> "Hi" to ""
            value.contains("hex") && listOf("decoder", "validator", "tester", "parser").any { value.endsWith("-$it") } -> "48 69" to ""
            value.contains("hex") -> "Hello" to ""
            value.contains("unicode") && listOf("decoder", "validator", "tester").any { value.endsWith("-$it") } -> "\\u0041\\u0020\\ud83d\\ude80" to ""
            value.contains("unicode") -> "A 🚀" to ""
            listOf("docker", "git", "graphql", "http", "javascript", "kubernetes", "markdown", "nginx", "openapi", "sql", "typescript", "yaml", "csv", "mime").any { value.startsWith("$it-") || value.startsWith("developer-$it-") } && value.endsWith("-decoder") -> "SGk=" to ""
            value.contains("data-uri") && value.contains("decoder") -> "data:text/plain;base64,SGk=" to ""
            (value.contains("html") || value.contains("xml") || value.contains("svg")) && value.endsWith("-decoder") -> "&lt;root&gt;Hi&lt;/root&gt;" to ""
            value.contains("css") && value.endsWith("-decoder") -> "hello\\a world" to ""
            value.contains("data-uri") -> "Hello from enV" to ""
            (value.contains("url") || value.contains("uri")) && value.contains("decoder") -> "hello%20world%20%26%20tea" to ""
            (value.contains("url") || value.contains("uri")) && value.contains("encoder") -> "hello world & tea" to ""
            value.contains("url") || value.contains("uri") -> "https://example.com/path?q=one&q=two#section" to ""
            value.contains("cookie-parser") -> "session=abc123; theme=dark; consent=yes" to ""
            value.contains("header-builder") -> "{\"Accept\":\"application/json\",\"X-Example\":\"enV\"}" to ""
            value.contains("ip-header-parser") -> "X-Forwarded-For: 192.0.2.1, 10.0.0.2" to ""
            value.contains("status-code") || value.contains("http-status") -> "404" to ""
            value.contains("mime") || value.contains("content-type") -> "json" to ""
            value.contains("csv") && value.endsWith("-decoder") -> "SGk=" to ""
            value.contains("csv") && listOf("validator", "tester", "parser", "formatter", "beautifier", "minifier", "inspector").any { value.endsWith("-$it") } -> "name,quote\nAda,\"Hello, world\"\nGrace,\"She said \"\"hi\"\"\"" to ""
            value.contains("csv") -> "[{\"name\":\"Ada\",\"age\":36},{\"name\":\"Grace\",\"age\":37}]" to ""
            value.contains("xml") || value.contains("html") || value.contains("svg") -> "<root><name>Ada</name></root>" to ""
            value.contains("css") -> ".card { color: #0d9f8a; padding: 16px; }" to ""
            value.contains("sql") -> "SELECT id, name FROM users WHERE active = true ORDER BY name;" to ""
            value.contains("yaml") -> "app:\n  name: enV\n  enabled: true" to ""
            value.contains("graphql") -> "query Example(\$id: ID!) { user(id: \$id) { id name } }" to ""
            value.contains("markdown-to-html") -> "# Hello\n\nA paragraph with **bold** and [a link](https://example.test)." to ""
            value.contains("markdown") -> "# Hello\n\nA paragraph with **bold**." to ""
            value.contains("gitignore") -> "node" to ""
            value.contains("docker") -> "node" to ""
            value.contains("nginx") -> "server { listen 80; server_name example.test; }" to ""
            value.contains("readme") -> "enV Developer Studio" to ""
            value.contains("environment-variable") -> "APP_ENV\nAPI_BASE_URL\nLOG_LEVEL" to ""
            value.contains("openapi") -> "enV Example API" to ""
            value.contains("branch-name") -> "Add local hash utilities" to ""
            value.contains("commit-message") -> "fix: handle empty input safely" to ""
            value.contains("changelog") -> "Unreleased\nImprove local developer utilities\nFix invalid input errors" to ""
            value.contains("user-agent") -> "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" to ""
            value.contains("http-request-builder") -> "https://api.example.test/v1?q=hi" to "POST"
            value.contains("http") && !value.contains("encoder") && !value.contains("decoder") -> "GET /health HTTP/1.1\nHost: api.example.test\nAccept: application/json" to ""
            value.contains("semantic-version") -> "1.2.3 patch" to ""
            else -> "Example input for $op" to ""
        }
    }
}

@Composable
private fun NativeDeveloperToolForm(tool: ToolRecord, onRelatedTool: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val studio = remember(tool.id) { NativeDeveloperStudios.forToolId(tool.id) }
    val modePreferences = remember { context.getSharedPreferences("env.developer-studio-modes", android.content.Context.MODE_PRIVATE) }
    var studioModeKey by rememberSaveable(tool.id) {
        mutableStateOf(studio?.let { spec -> modePreferences.getString(spec.id, null)?.takeIf { key -> spec.modes.any { it.key == key } } } ?: studio?.modes?.firstOrNull()?.key.orEmpty())
    }
    var detectedHint by remember(tool.id) { mutableStateOf<com.chastech.env.engine.DeveloperInputHint?>(null) }
    var detectionMessage by remember(tool.id) { mutableStateOf("") }
    fun hintFromSuggestion(raw: String?): com.chastech.env.engine.DeveloperInputHint? {
        val suggested = com.chastech.env.engine.NativeDeveloperClipboardSuggest.suggest(raw) ?: return null
        val value = JSONObject(suggested)
        return com.chastech.env.engine.DeveloperInputHint(
            kind = value.getString("kind"), confidence = value.getString("confidence"),
            studioSlug = value.getString("studioSlug"), modeKey = value.getString("modeKey"), reason = value.getString("reason")
        )
    }
    fun openDetectedStudio(hint: com.chastech.env.engine.DeveloperInputHint) {
        val target = NativeDeveloperStudios.forToolId(hint.studioSlug) ?: return
        if (target.modes.any { it.key == hint.modeKey }) modePreferences.edit().putString(target.id, hint.modeKey).apply()
        onRelatedTool(target.id)
    }
    val directionPreferences = remember { context.getSharedPreferences("env.developer-studio-directions", android.content.Context.MODE_PRIVATE) }
    var encodingDirection by rememberSaveable(tool.id) {
        mutableStateOf(studio?.let { directionPreferences.getString(it.id, null) }?.takeIf { it == "encode" || it == "decode" } ?: "encode")
    }
    var devopsPreset by rememberSaveable(tool.id) { mutableStateOf("node") }
    val selectedStudioMode = studio?.modes?.firstOrNull { it.key == studioModeKey } ?: studio?.modes?.firstOrNull()
    val op = when {
        selectedStudioMode == null -> tool.engine.extras["op"] ?: tool.engine.id
        encodingDirection == "decode" && selectedStudioMode.decodeOp != null -> selectedStudioMode.decodeOp
        else -> selectedStudioMode.op
    }
    val activeTool = remember(tool, op) { tool.copy(engine = tool.engine.copy(extras = tool.engine.extras + ("op" to op))) }
    val fileHash = NativeDeveloperToolFormPolicy.isFileHash(op)
    val recipeRunner = op == "developer-recipe-runner"
    var input by rememberSaveable(tool.id) { mutableStateOf("") }
    var secondary by rememberSaveable(tool.id) { mutableStateOf("") }
    var recipeSource by rememberSaveable(tool.id) { mutableStateOf("  <p>Hello   <strong>enV</strong> 🚀</p>\r\n") }
    val recipeSteps = remember(tool.id) { mutableStateListOf("normalize-newlines", "replace-literal", "replace-literal", "collapse-whitespace", "trim") }
    var recipeOperationMenuExpanded by remember(tool.id) { mutableStateOf(false) }
    var recipeFind by rememberSaveable(tool.id) { mutableStateOf("<p>") }
    var recipeReplacementText by rememberSaveable(tool.id) { mutableStateOf("") }
    var recipePointer by rememberSaveable(tool.id) { mutableStateOf("/user/id") }
    var flags by rememberSaveable(tool.id) { mutableStateOf("g") }
    var replacement by rememberSaveable(tool.id) { mutableStateOf("") }
    var regexMode by rememberSaveable(tool.id) { mutableStateOf(if (op.contains("explainer", true)) "flavors" else "test") }
    var sqlDialect by rememberSaveable(tool.id) { mutableStateOf("postgresql") }
    val devopsPresetMode = studio?.id == "devops-studio" && studioModeKey in setOf("gitignore", "dockerfile")
    val regexStudio = op.contains("regex", true) && !op.contains("regex-generator", true)
    val sqlFormatter = op.contains("sql", true) && (op.contains("formatter", true) || op.contains("beautifier", true))
    var selectedFileName by rememberSaveable(tool.id) { mutableStateOf("") }
    var selectedFileUri by rememberSaveable(tool.id) { mutableStateOf("") }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            selectedFileUri = uri.toString()
            runCatching {
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (index >= 0) cursor.getString(index).orEmpty() else "Selected local file"
                    } else "Selected local file"
                } ?: "Selected local file"
            }.onSuccess { selectedFileName = it; error = "" }
                .onFailure { error = it.message ?: "Unable to read file metadata." }
        }
    }
    val saveLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openOutputStream(uri)?.use { it.write(output.toByteArray(Charsets.UTF_8)) }
                ?: throw IllegalStateException("Could not open the selected file.")
        }.onFailure { error = it.message ?: "Unable to save output." }
    }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    fun recipeConfiguration(): String {
        val steps = JSONArray()
        recipeSteps.forEachIndexed { index, step ->
            val entry = JSONObject().put("name", "${index + 1}. $step").put("op", step)
            if (step == "replace-literal") entry.put("find", recipeFind).put("replacement", recipeReplacementText)
            if (step == "json-pointer-get") entry.put("pointer", recipePointer)
            steps.put(entry)
        }
        return JSONObject().put("input", recipeSource).put("steps", steps).toString()
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (studio == null) {
            Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                Text("Runs entirely on this device. Nothing is uploaded.", modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (studio != null) {
            Text("Choose a mode", style = MaterialTheme.typography.titleSmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                studio.modes.forEach { mode ->
                    FilterChip(selected = selectedStudioMode?.key == mode.key, onClick = {
                        studioModeKey = mode.key
                        modePreferences.edit().putString(studio.id, mode.key).apply()
                        encodingDirection = "encode"
                        directionPreferences.edit().putString(studio.id, "encode").apply()
                        output = ""; error = ""
                    }, label = { Text(mode.label) })
                }
            }
            if (selectedStudioMode?.decodeOp != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = encodingDirection == "encode", onClick = { encodingDirection = "encode"; directionPreferences.edit().putString(studio.id, "encode").apply(); output = ""; error = "" }, label = { Text("Encode") })
                    FilterChip(selected = encodingDirection == "decode", onClick = { encodingDirection = "decode"; directionPreferences.edit().putString(studio.id, "decode").apply(); output = ""; error = "" }, label = { Text("Decode") })
                }
            }
        }
        if (devopsPresetMode) {
            Text("Stack preset", style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("node" to "Node.js", "python" to "Python", "go" to "Go", "java" to "Java", "rust" to "Rust", "swift" to "Swift", "android" to "Android", "static" to "Static site", "generic" to "Generic").forEach { (value, label) ->
                    FilterChip(selected = devopsPreset == value, onClick = { devopsPreset = value; output = ""; error = "" }, label = { Text(label) })
                }
            }
            Text("Review generated paths, base images, build commands, and runtime assumptions before deployment.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = {
                // Explicit user action only: no clipboard listener or background clipboard polling.
                val clipboardText = runCatching {
                    context.getSystemService(ClipboardManager::class.java)?.primaryClip?.let { clip ->
                        if (clip.itemCount > 0) clip.getItemAt(0).coerceToText(context).toString() else null
                    }
                }.getOrNull()
                if (clipboardText.isNullOrBlank()) {
                    detectedHint = null
                    detectionMessage = "Clipboard has no readable text."
                } else {
                    input = clipboardText
                    detectedHint = hintFromSuggestion(clipboardText)
                    detectionMessage = if (detectedHint == null) "No confident Developer Studio match found; text was placed in the input." else "Detected from clipboard. Nothing was uploaded."
                }
            }) { Text("Detect from clipboard") }
            Text("Detects locally only when tapped.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (detectionMessage.isNotBlank()) Text(detectionMessage, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (detectedHint != null) {
            val hint = detectedHint!!
            val target = NativeDeveloperStudios.forToolId(hint.studioSlug)
            if (target != null) {
                Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Suggested: ${target.name} · ${hint.modeKey}", style = MaterialTheme.typography.titleSmall)
                        Text("${hint.reason} Confidence: ${hint.confidence}.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedButton(onClick = { openDetectedStudio(hint) }) { Text("Open suggested Studio") }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = {
                val (sample, sampleSecondary) = NativeDeveloperToolFormPolicy.example(op)
                if (recipeRunner) {
                    recipeSource = "  <p>Hello   <strong>enV</strong> 🚀</p>\r\n"
                    recipeSteps.clear(); recipeSteps.addAll(listOf("normalize-newlines", "replace-literal", "replace-literal", "collapse-whitespace", "trim"))
                    recipeFind = "<p>"; recipeReplacementText = ""; recipePointer = "/user/id"
                } else if (devopsPresetMode) { input = ""; secondary = "" }
                else { input = sample; secondary = sampleSecondary }
                flags = if (op.contains("regex", true)) "gi" else "g"; replacement = if (op.contains("replace", true)) "dog" else ""; regexMode = "test"; sqlDialect = "postgresql"; output = ""; error = ""
            }) { Text("Load example") }
            Text("Ctrl/⌘+Enter support is available on Web; native uses the action button.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (fileHash) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Button(onClick = { filePicker.launch(arrayOf("*/*")) }) { Text("Choose local file") }
                Text(selectedFileName.ifBlank { "Select a file to hash locally" }, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
            }
        }
        if (recipeRunner) {
            Text("Recipe Pipeline", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Text("Build a bounded, deterministic transformation chain. Steps run in order; each result is inspectable, and nothing is uploaded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            InputField(recipeSource, { recipeSource = it }, "Source text", placeholder = "Paste text, JSON, CSV, or encoded data…", minLines = 5, tall = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box {
                    OutlinedButton(onClick = { recipeOperationMenuExpanded = true }, enabled = recipeSteps.size < 16) { Text("Add step") }
                    DropdownMenu(expanded = recipeOperationMenuExpanded, onDismissRequest = { recipeOperationMenuExpanded = false }) {
                        NativeDeveloperRecipe.supportedOperations.forEach { operation ->
                            DropdownMenuItem(text = { Text(operation) }, onClick = { if (recipeSteps.size < 16) recipeSteps.add(operation); recipeOperationMenuExpanded = false })
                        }
                    }
                }
                Text("${recipeSteps.size}/16 steps", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                recipeSteps.forEachIndexed { index, operation ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                        Text("${index + 1}.", style = MaterialTheme.typography.labelMedium)
                        Text(operation, modifier = Modifier.weight(1f), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                        TextButton(onClick = { if (index > 0) { val item = recipeSteps.removeAt(index); recipeSteps.add(index - 1, item) } }, enabled = index > 0) { Text("↑") }
                        TextButton(onClick = { if (index < recipeSteps.lastIndex) { val item = recipeSteps.removeAt(index); recipeSteps.add(index + 1, item) } }, enabled = index < recipeSteps.lastIndex) { Text("↓") }
                        TextButton(onClick = { recipeSteps.removeAt(index) }) { Text("×") }
                    }
                }
            }
            if (recipeSteps.contains("replace-literal")) {
                InputField(recipeFind, { recipeFind = it }, "Literal text to find", minLines = 1)
                InputField(recipeReplacementText, { recipeReplacementText = it }, "Replacement text (empty removes the match)", minLines = 1)
                Text("These settings apply to each Replace Literal step in this native builder.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (recipeSteps.contains("json-pointer-get")) InputField(recipePointer, { recipePointer = it }, "RFC 6901 JSON Pointer", placeholder = "/items/0/id", minLines = 1)
            OutlinedButton(onClick = { runCatching { copy(recipeConfiguration()) }.onFailure { error = it.message ?: "Could not serialize recipe." } }) { Text("Copy recipe JSON") }
        } else {
            InputField(input, { value -> input = value; detectedHint = com.chastech.env.engine.NativeDeveloperSmartDetect.detect(value); detectionMessage = if (detectedHint == null) "" else "Detected a likely input type locally." }, if (devopsPresetMode) "Optional stack override (blank uses $devopsPreset)" else if (regexStudio && regexMode == "pipeline") "Default pattern (unused by layers)" else if (op.contains("regex", true)) "Regular expression" else "Input", placeholder = if (devopsPresetMode) "Leave blank to use the selected preset" else "Paste your code, data, token, URL, or text here…", minLines = 5, tall = true)
        }
        if (regexStudio) {
            Text("Regex Studio mode", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                listOf("test", "benchmark", "pipeline", "format", "flavors").forEach { mode ->
                    FilterChip(selected = regexMode == mode, onClick = { regexMode = mode }, label = { Text(mode.replaceFirstChar { it.uppercase() }) })
                }
            }
            Text("Android uses the native Java regex engine. Risk heuristics and input limits reduce exposure, but a single Matcher call cannot be reliably force-cancelled on this thread; risky near-miss inputs are skipped.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if ((!regexStudio && NativeDeveloperToolFormPolicy.needsSecondInput(op)) || (regexStudio && regexMode in setOf("test", "benchmark", "pipeline"))) {
            InputField(secondary, { secondary = it }, when { regexStudio && regexMode == "pipeline" -> "Pipeline JSON (input + ordered layers)"; regexStudio && regexMode == "benchmark" -> "Test strings JSON (short bounded samples)"; regexStudio && regexMode == "format" -> "Not used in Format mode"; regexStudio && regexMode == "flavors" -> "Not used in Flavor mode"; op.contains("regex", true) -> "Test text or JSON batch"; op.contains("json-path", true) || op.contains("jsonpath", true) -> "JSON path (e.g. $.items[0].id)"; op.contains("uuid", true) -> "Batch count"; else -> "Second input" }, minLines = 4, tall = true)
        }
        if (sqlFormatter) {
            Text("SQL dialect", style = MaterialTheme.typography.labelLarge)
            var dialectMenuExpanded by remember(tool.id) { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { dialectMenuExpanded = true }) { Text(sqlDialect.uppercase().replace("TRANSACTSQL", "T-SQL")) }
                DropdownMenu(expanded = dialectMenuExpanded, onDismissRequest = { dialectMenuExpanded = false }) {
                    listOf("sql", "postgresql", "mysql", "mariadb", "sqlite", "transactsql", "bigquery", "snowflake", "oracle", "redshift", "duckdb").forEach { dialect ->
                        DropdownMenuItem(text = { Text(dialect.uppercase().replace("TRANSACTSQL", "T-SQL")) }, onClick = { sqlDialect = dialect; dialectMenuExpanded = false })
                    }
                }
            }
            Text("Conservative dialect-aware formatter; not a full SQL grammar validator.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (regexStudio || NativeDeveloperToolFormPolicy.needsRegexFlags(op)) {
            Text("Regex flags", style = MaterialTheme.typography.labelLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                listOf("g", "i", "m", "s", "u").forEach { flag ->
                    FilterChip(selected = flag in flags, onClick = { flags = if (flag in flags) flags.filterNot { it.toString() == flag } else flags + flag }, label = { Text(flag) })
                }
            }
            InputField(flags, { flags = it.filter { character -> character in "gimsu" }.toList().distinct().joinToString("") }, "Flags (editable; Java regex semantics)", minLines = 1, singleLine = true)
        }
        if ((regexStudio && regexMode in setOf("test", "benchmark")) || (!regexStudio && NativeDeveloperToolFormPolicy.needsReplacement(op))) {
            InputField(replacement, { replacement = it }, "Replacement preview (optional)", minLines = 1, singleLine = true)
        }
        val regexPreviewState: Pair<JSONObject?, String?> = remember(input, secondary, flags, regexStudio, regexMode) {
            if (regexStudio && regexMode == "test" && input.isNotEmpty() && secondary.isNotEmpty()) {
                runCatching { JSONObject(NativeRegexHighlight.build(input, secondary, flags)) }
                    .fold(onSuccess = { it to null }, onFailure = { null to (it.message ?: "Live preview unavailable.") })
            } else null to null
        }
        if (regexStudio && regexMode == "test" && secondary.isNotEmpty()) {
            val preview = regexPreviewState.first
            val previewError = regexPreviewState.second
            Text("Live match preview", style = MaterialTheme.typography.labelLarge)
            Text("Engine: java.util.regex · bounded sample; preview is not JavaScript RegExp", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (preview != null) {
                val segments = preview.optJSONArray("segments")
                val highlighted = buildAnnotatedString {
                    if (segments != null) for (index in 0 until segments.length()) {
                        val segment = segments.optJSONObject(index) ?: continue
                        val segmentText = segment.optString("text")
                        if (segment.optBoolean("isMatch")) withStyle(SpanStyle(background = MaterialTheme.colorScheme.primaryContainer, color = MaterialTheme.colorScheme.onPrimaryContainer)) { append(segmentText) }
                        else append(segmentText)
                    }
                }
                Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(8.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
                    androidx.compose.material3.Text(text = highlighted, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(10.dp))
                }
                val matches = preview.optJSONArray("matches")
                val firstMatch = matches?.optJSONObject(0)
                val groups = firstMatch?.optJSONArray("groups")
                if (groups != null && groups.length() > 0) {
                    Text("Capture groups", style = MaterialTheme.typography.labelLarge)
                    for (groupIndex in 0 until minOf(groups.length(), 12)) {
                        val group = groups.optJSONObject(groupIndex) ?: continue
                        val name = group.optString("groupName").takeUnless { it == "null" || it == "" }?.let { " · $it" }.orEmpty()
                        val captured = group.opt("text")?.takeUnless { it == JSONObject.NULL }?.toString() ?: "(unmatched)"
                        Text("group ${group.optInt("groupIndex")}$name: $captured", style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
                    }
                }
                Text("${preview.optInt("matchCount")} match(es)${if (preview.optBoolean("truncated")) " · preview capped at 100" else ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else Text(previewError ?: "Enter a pattern and sample text to see highlighted matches.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                scope.launch {
                    runCatching {
                        if (fileHash) {
                            require(selectedFileUri.isNotBlank()) { "Choose a local file first. File bytes are never uploaded." }
                            withContext(Dispatchers.IO) {
                                val uri = Uri.parse(selectedFileUri)
                                context.contentResolver.openInputStream(uri)?.use { NativeUtilityEngine.hashDeveloperFileStream(op, it) }
                                    ?: throw IllegalArgumentException("Unable to open the selected local file.")
                            }
                        } else {
                            val options = JSONObject().apply {
                                if (regexStudio || NativeDeveloperToolFormPolicy.needsSecondInput(op)) put("secondary", secondary)
                                if (regexStudio || NativeDeveloperToolFormPolicy.needsRegexFlags(op)) put("flags", flags)
                                if (regexStudio || NativeDeveloperToolFormPolicy.needsReplacement(op)) put("replacement", replacement)
                                if (regexStudio) put("mode", regexMode)
                                if (sqlFormatter) put("dialect", sqlDialect)
                            }.toString()
                            withContext(Dispatchers.Default) { NativeUtilityEngine.run(activeTool, if (recipeRunner) recipeConfiguration() else if (devopsPresetMode && input.isBlank()) devopsPreset else input, options).text }
                        }
                    }.fold({ output = it; error = "" }, { output = ""; error = it.message ?: "Could not process this input." })
                }
            }) { Text(if (regexStudio) when (regexMode) { "test" -> "Run tests"; "benchmark" -> "Benchmark"; "pipeline" -> "Run pipeline"; "format" -> "Format regex"; else -> "Analyze flavors" } else NativeDeveloperToolFormPolicy.actionLabel(op)) }
            OutlinedButton(onClick = { input = ""; secondary = ""; recipeSource = ""; recipeSteps.clear(); recipeFind = ""; recipeReplacementText = ""; recipePointer = "/"; flags = "g"; replacement = ""; regexMode = "test"; sqlDialect = "postgresql"; selectedFileName = ""; selectedFileUri = ""; output = ""; error = ""; detectedHint = null; detectionMessage = "" }) { Text("Reset") }
        }
        if (error.isNotEmpty()) Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Text(error, color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(12.dp))
        }
        if (output.isNotEmpty()) Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                Text("Result", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Normal)
                Text(output, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End)) {
                    OutlinedButton(onClick = { copy(output) }) { Text("Copy") }
                    OutlinedButton(onClick = { saveLauncher.launch("env-$op.txt") }) { Text("Download") }
                }
            }
        }
    }
}

@Composable
private fun InputField(value: String, onValueChange: (String) -> Unit, label: String, placeholder: String? = null, minLines: Int = 1, singleLine: Boolean = false, tall: Boolean = false, modifier: Modifier = Modifier) {
    OutlinedTextField(value, onValueChange, modifier.fillMaxWidth().then(if (tall) Modifier.height(170.dp) else Modifier), label = { Text(label) }, placeholder = placeholder?.let { { Text(it) } }, minLines = minLines, singleLine = singleLine)
}

@Composable
private fun ActionRow(onRun: () -> Unit, onReset: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = onRun) { Text("Run") }
        Button(onClick = onReset) { Text("Reset") }
    }
}

@Composable
private fun ResultBox(output: String, error: String, onCopy: (String) -> Unit) {
    if (error.isNotEmpty()) Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) { Text("Check your input: $error", color = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.padding(12.dp)) }
    if (output.isNotEmpty()) Surface(color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("Result", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Normal)
            Text(output, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { Button(onClick = { onCopy(output) }) { Text("Copy output") } }
        }
    }
}

@Composable
private fun ToolList(tools: List<ToolRecord>, favorites: Set<String>, onTool: (String) -> Unit, onToggle: (String) -> Unit, modifier: Modifier = Modifier, emptyMessage: String = "Nothing to show") {
    if (tools.isEmpty()) Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Text(emptyMessage, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(32.dp)) }
    else LazyColumn(modifier, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { items(tools, key = { it.id }) { tool -> ToolCard(tool, tool.id in favorites, onTool, onToggle) } }
}

@Composable
private fun ToolCard(tool: ToolRecord, favorite: Boolean, onTool: (String) -> Unit, onToggle: (String) -> Unit) {
    Card(Modifier.fillMaxWidth().alpha(if (tool.status == "planned") 0.7f else 1f), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
            Row(Modifier.weight(1f).clickable { onTool(tool.id) }, verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    EnVToolAppIcon(tool, size = 36.dp)
                    Text(tool.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 12.dp))
                    Text(tool.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                    if (tool.isUnderProduction()) {
                        StatusPill("Under production", Modifier.padding(top = 10.dp))
                    } else if (tool.status == "planned") {
                        StatusPill("Coming soon", Modifier.padding(top = 10.dp))
                    } else if (NativeCopy.isWebRuntimeOnly(tool.id)) {
                        StatusPill("WEB ONLY", Modifier.padding(top = 10.dp))
                    } else if (tool.clientSide) {
                        StatusPill("ON DEVICE", Modifier.padding(top = 10.dp))
                    }
                    Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.End) {
                        EnVIcon("ArrowRight", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurface)
                    }
                }
            }
            IconButton(onClick = { onToggle(tool.id) }, modifier = Modifier.semantics { contentDescription = if (favorite) "Remove ${tool.name} from saved" else "Save ${tool.name}" }) {
                EnVIcon("Heart", tint = if (favorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun CategoryGrid(catalog: Catalog, selected: String?, onSelected: (String?) -> Unit, compact: Boolean = false) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 20.dp)) {
        if (!compact) AssistChip(onClick = { onSelected(null) }, label = { Text("All") }, leadingIcon = { EnVIcon("LayoutGrid", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface) })
        catalog.categories.forEach { category -> FilterChip(selected = selected == category.id, onClick = { onSelected(if (selected == category.id) null else category.id) }, label = { Text(category.name) }, leadingIcon = { EnVIcon(category.icon, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface) }) }
    }
}

@Composable
private fun CategoryCard(category: com.chastech.env.data.Category, onClick: () -> Unit) {
    Card(
        Modifier.width(160.dp).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Surface(Modifier.size(36.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(6.dp)) {
                Box(contentAlignment = Alignment.Center) { EnVIcon(category.icon, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface) }
            }
            Text(category.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(category.blurb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun SearchBox(catalog: Catalog, value: String, onValueChange: (String) -> Unit, onTool: (String) -> Unit, onFocusChange: (Boolean) -> Unit = {}) {
    var focused by remember { mutableStateOf(false) }
    val suggestions = remember(catalog, value) { if (value.isBlank()) emptyList() else catalog.webSearch(value, limit = 8, includeRelatedReferences = true) }
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).semantics { contentDescription = "Search tools"; isTraversalGroup = true }) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val suggestionWidth = maxWidth
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused; onFocusChange(it.isFocused) },
            placeholder = { Text("Search tools") },
            leadingIcon = { EnVIcon("Search", tint = MaterialTheme.colorScheme.onSurfaceVariant, contentDescription = "Search") },
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { suggestions.firstOrNull()?.let { onTool(it.id) } }),
        )
        if (focused && value.isNotBlank()) {
            Popup(alignment = Alignment.TopStart, offset = IntOffset(0, with(LocalDensity.current) { 64.dp.roundToPx() }), onDismissRequest = { focused = false; onFocusChange(false) }) {
            Surface(Modifier.width(suggestionWidth), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shadowElevation = 6.dp) {
                Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (suggestions.isEmpty()) {
                        Text("No matching tools. Try “json”, “bmi”, or “qr”.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp).semantics { liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite })
                    } else {
                        suggestions.forEach { WebHomeSearchSuggestion(it, onTool) }
                    }
                    TextButton(onClick = { focused = false; onFocusChange(false) }, modifier = Modifier.align(Alignment.End)) { Text("See more results") }
                }
            }
            }
        }
        }
    }
}

@Composable
private fun HomePreviewBar(label: String, modifier: Modifier = Modifier, isLarge: Boolean = false, containerColor: Color, onClick: (() -> Unit)? = null, accessibilityLabel: String = label) {
    Surface(
        modifier = if (onClick == null) modifier.height(40.dp) else modifier.height(40.dp).clickable(onClick = onClick).semantics { contentDescription = accessibilityLabel },
        color = containerColor,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Box(Modifier.fillMaxSize().padding(horizontal = if (isLarge) 16.dp else 8.dp), contentAlignment = Alignment.Center) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = if (isLarge) 14.sp else 10.sp),
                fontWeight = FontWeight.Normal,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                maxLines = 1,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable private fun SectionTitle(text: String, subtitle: String? = null, accent: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.padding(top = 4.dp)) {
        Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Normal, color = if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
        subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
@Composable private fun StatusPill(text: String, modifier: Modifier = Modifier) { Surface(modifier = modifier, color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(5.dp)) { Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) } }
@Composable private fun DetailRow(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, fontWeight = FontWeight.Normal, modifier = Modifier.padding(start = 12.dp)) } }
@Composable private fun SettingCard(title: String, detail: String, iconName: String, onClick: (() -> Unit)? = null) {
    val modifier = if (onClick == null) Modifier.fillMaxWidth() else Modifier.fillMaxWidth().clickable(onClick = onClick)
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            EnVIcon(iconName, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.padding(start = 14.dp)) {
                Text(title, fontWeight = FontWeight.Normal)
                Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}


@Composable
private fun NativeBusinessToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    var a by rememberSaveable(tool.id) { mutableStateOf("1000") }
    var b by rememberSaveable(tool.id) { mutableStateOf("600") }
    var c by rememberSaveable(tool.id) { mutableStateOf("50") }
    var d by rememberSaveable(tool.id) { mutableStateOf("0") }
    var e by rememberSaveable(tool.id) { mutableStateOf("12") }
    var monthlyContribution by rememberSaveable(tool.id) { mutableStateOf("0") }
    var targetProfit by rememberSaveable(tool.id) { mutableStateOf("0") }
    var lineItems by rememberSaveable(tool.id) { mutableStateOf("Professional service | 1 | 100") }
    var businessName by rememberSaveable(tool.id) { mutableStateOf("Your Business") }
    var clientName by rememberSaveable(tool.id) { mutableStateOf("Client") }
    var documentNumber by rememberSaveable(tool.id) { mutableStateOf("DOC-001") }
    var documentDate by rememberSaveable(tool.id) { mutableStateOf(java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())) }
    var currency by rememberSaveable(tool.id) { mutableStateOf("USD") }
    var currencyMenuExpanded by rememberSaveable(tool.id) { mutableStateOf(false) }
    var logoBitmap by remember(tool.id) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var taxPercent by rememberSaveable(tool.id) { mutableStateOf("0") }
    var discountPercent by rememberSaveable(tool.id) { mutableStateOf("0") }
    val originalBusinessOp = tool.engine.extras["op"] ?: tool.engine.id
    val businessStudioModes: List<Pair<String, String>> = when (originalBusinessOp) {
        in setOf("invoice", "receipt", "quotation", "estimate", "purchase-order") -> listOf("Invoice" to "invoice", "Receipt" to "receipt", "Quotation" to "quotation", "Estimate" to "estimate", "Purchase order" to "purchase-order")
        in setOf("business-name", "company-name", "brand-name", "product-name", "slogan", "sku") -> listOf("Business" to "business-name", "Company" to "company-name", "Brand" to "brand-name", "Product" to "product-name", "Slogan" to "slogan", "SKU" to "sku")
        in setOf("agenda", "minutes", "meeting-agenda", "meeting-minutes", "email-signature", "payslip") -> listOf("Agenda" to "meeting-agenda", "Minutes" to "meeting-minutes", "Signature" to "email-signature", "Payslip demo" to "payslip")
        else -> listOf("Break-even" to "break-even", "Cash flow" to "cash-flow", "Commission" to "commission", "CAC" to "customer-acquisition-cost", "LTV" to "customer-lifetime-value", "ROI" to "roi", "Pricing" to "pricing", "Markup" to "markup", "Recurring revenue" to "recurring-revenue", "Expense" to "expense", "Inventory" to "inventory", "Discount" to "discount", "Margin" to "margin", "Profit" to "profit", "Salary" to "salary")
    }
    var selectedBusinessStudioMode by rememberSaveable(tool.id) { mutableStateOf(if (originalBusinessOp == "agenda") "meeting-agenda" else if (originalBusinessOp == "minutes") "meeting-minutes" else originalBusinessOp) }
    val op = selectedBusinessStudioMode.takeIf { selected -> businessStudioModes.any { it.second == selected } } ?: originalBusinessOp
    val businessStudioModeTitle = businessStudioModes.firstOrNull { it.second == op }?.first ?: tool.name
    val isNaming = op in setOf("business-name", "company-name", "brand-name", "product-name")
    var seed by rememberSaveable(tool.id) { mutableStateOf("technology") }
    var audience by rememberSaveable(tool.id) { mutableStateOf("customers") }
    var agendaItems by rememberSaveable(tool.id) { mutableStateOf("Welcome and objectives | 5\nProgress updates | 10\nDecisions and blockers | 15\nActions and next steps | 5") }
    var signatureName by rememberSaveable(tool.id) { mutableStateOf("Alex Morgan") }
    var signatureRole by rememberSaveable(tool.id) { mutableStateOf("Founder") }
    var signatureEmail by rememberSaveable(tool.id) { mutableStateOf("hello@example.com") }
    var signaturePhone by rememberSaveable(tool.id) { mutableStateOf("") }
    var signatureWebsite by rememberSaveable(tool.id) { mutableStateOf("") }
    var signatureSocialLink by rememberSaveable(tool.id) { mutableStateOf("") }
    var namingStyle by rememberSaveable(tool.id) { mutableStateOf("descriptive") }
    var maxNameLength by rememberSaveable(tool.id) { mutableStateOf("32") }
    var nameBlacklist by rememberSaveable(tool.id) { mutableStateOf("") }
    var generationOffset by rememberSaveable(tool.id) { mutableIntStateOf(0) }
    var ltvModel by rememberSaveable(tool.id) { mutableStateOf("simple") }
    var grossMarginPct by rememberSaveable(tool.id) { mutableStateOf("80") }
    var monthlyChurnPct by rememberSaveable(tool.id) { mutableStateOf("5") }
    var meetingTitle by rememberSaveable(tool.id) { mutableStateOf("Weekly planning") }
    var meetingDateTime by rememberSaveable(tool.id) { mutableStateOf("") }
    var meetingLocation by rememberSaveable(tool.id) { mutableStateOf("") }
    var meetingGoal by rememberSaveable(tool.id) { mutableStateOf("Weekly planning") }
    var attendees by rememberSaveable(tool.id) { mutableStateOf("Team") }
    var prepNotes by rememberSaveable(tool.id) { mutableStateOf("") }
    var discussionNotes by rememberSaveable(tool.id) { mutableStateOf("") }
    var decisions by rememberSaveable(tool.id) { mutableStateOf("") }
    var actionItems by rememberSaveable(tool.id) { mutableStateOf("") }
    var nextMeeting by rememberSaveable(tool.id) { mutableStateOf("") }
    var payPeriod by rememberSaveable(tool.id) { mutableStateOf("") }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    fun replaceLocalLogo(next: android.graphics.Bitmap?) {
        val previous = logoBitmap
        logoBitmap = next
        if (previous != null && previous !== next && !previous.isRecycled) previous.recycle()
    }
    val currentLogoForLifecycle = logoBitmap
    DisposableEffect(currentLogoForLifecycle) {
        onDispose { currentLogoForLifecycle?.let { if (!it.isRecycled) it.recycle() } }
    }
    fun businessLineRows(): List<List<String>> = lineItems.split("\n").filter { it.isNotBlank() }.map { line ->
        val parts = line.split("|").map { it.trim() }
        listOf(parts.getOrElse(0) { "" }, parts.getOrElse(1) { "1" }, parts.getOrElse(2) { "0" })
    }.ifEmpty { listOf(listOf("", "1", "0")) }
    fun persistBusinessLineRows(rows: List<List<String>>) {
        lineItems = rows.joinToString("\n") { "${it.getOrElse(0) { "" }} | ${it.getOrElse(1) { "1" }} | ${it.getOrElse(2) { "0" }}" }
    }
    fun updateBusinessLineItem(index: Int, column: Int, value: String) {
        val rows = businessLineRows().map { it.toMutableList() }.toMutableList()
        while (rows.size <= index) rows.add(mutableListOf("", "1", "0"))
        rows[index][column] = value
        persistBusinessLineRows(rows)
    }
    fun addBusinessLineItem() { persistBusinessLineRows(businessLineRows() + listOf(listOf("New item", "1", "0"))) }
    fun removeBusinessLineItem(index: Int) {
        val rows = businessLineRows().toMutableList()
        if (rows.size <= 1) rows[0] = listOf("", "1", "0") else rows.removeAt(index)
        persistBusinessLineRows(rows)
    }
    fun loadBusinessExample() {
        generationOffset = 0
        when (op) {
            "invoice", "receipt", "quotation", "estimate", "purchase-order" -> { businessName = "Acme Solar Co."; clientName = "Example Customer"; documentNumber = "INV-EXAMPLE-001"; documentDate = "2026-10-15"; currency = "USD"; taxPercent = "7.5"; discountPercent = "5"; lineItems = "Solar panel | 3 | 250\nInstallation | 1 | 100"; replaceLocalLogo(null) }
            "business-name", "company-name", "brand-name", "product-name" -> { seed = "solar energy"; namingStyle = "descriptive"; maxNameLength = "32"; nameBlacklist = "" }
            "slogan" -> { seed = "solar energy"; audience = "homeowners" }
            "sku" -> seed = "TEC"
            "agenda", "meeting-agenda", "minutes", "meeting-minutes" -> { meetingTitle = "Solar launch review"; meetingDateTime = "2026-10-20 10:00"; meetingLocation = "Video conference"; meetingGoal = "Decide launch readiness and owners"; attendees = "Product lead; Operations lead; Marketing lead"; prepNotes = "Review launch metrics and open blockers."; agendaItems = "Metrics review | 10\nDecision log | 20\nActions and owners | 10"; discussionNotes = "Launch readiness, support coverage, unresolved blockers."; decisions = "Approve launch after support checklist passes."; actionItems = "Operations lead | Finalize support checklist | 2026-10-19\nMarketing lead | Confirm launch copy | 2026-10-19"; nextMeeting = "2026-10-21 10:00" }
            "email-signature" -> { signatureName = "Jordan Example"; signatureRole = "Operations Lead"; signatureEmail = "jordan@example.com"; businessName = "Acme Solar Co."; signaturePhone = "+1 555 0100"; signatureWebsite = "https://example.com"; signatureSocialLink = "https://www.linkedin.com/" }
            "payslip" -> { businessName = "Example Company"; clientName = "Example Employee"; payPeriod = "Example pay period"; a = "5000"; b = "500"; c = "100" }
            "break-even" -> { a = "50"; b = "10000"; c = "30"; targetProfit = "5000" }
            "commission" -> { a = "50000"; b = "8" }
            "customer-acquisition-cost" -> { a = "5000"; b = "100"; d = "250"; monthlyContribution = "10" }
            "customer-lifetime-value" -> { ltvModel = "saas"; a = "50"; b = "12"; c = "24"; d = "100"; grossMarginPct = "80"; monthlyChurnPct = "5"; monthlyContribution = "0" }
            "cash-flow" -> { a = "800"; b = "900"; c = "1000" }
            "roi" -> { a = "150"; b = "100" }
            "salary" -> a = "52000"
            "pricing", "markup" -> { a = "100"; b = "25" }
            "margin", "profit" -> { a = "100"; b = "70" }
            "discount" -> { a = "100"; b = "15" }
            "recurring-revenue" -> { a = "10000"; b = "20" }
            "expense" -> { a = "100"; b = "200"; c = "300"; d = "40"; e = "20" }
            "inventory" -> { a = "12"; b = "25"; c = "5" }
        }
        output = ""; error = ""
    }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    val saveOutputLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) { uri ->
        if (uri != null) runCatching {
            context.contentResolver.openOutputStream(uri)?.use { it.write(output.toByteArray(Charsets.UTF_8)) }
                ?: throw IllegalStateException("Could not open the selected file.")
        }.onFailure { error = it.message ?: "Unable to save business output." }
    }
    val chooseLogoLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) runCatching {
            val resolver = context.contentResolver
            val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            val boundsStream = resolver.openInputStream(uri) ?: throw IllegalStateException("Could not read the selected logo.")
            boundsStream.use { android.graphics.BitmapFactory.decodeStream(it, null, bounds) }
            require(bounds.outWidth > 0 && bounds.outHeight > 0) { "The selected file is not a readable image." }
            var sample = 1
            while (bounds.outWidth / sample > 1200 || bounds.outHeight / sample > 1200) sample *= 2
            val decodeOptions = android.graphics.BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = android.graphics.Bitmap.Config.RGB_565
            }
            replaceLocalLogo(resolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, decodeOptions) }
                ?: throw IllegalStateException("Could not decode the selected logo."))
        }.onFailure { error = it.message ?: "Unable to load local logo." }
    }
    val savePdfLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri ->
        if (uri != null) runCatching {
            val bytes = NativeBusinessPdfExporter.create(output, businessStudioModeTitle, logoBitmap)
            context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                ?: throw IllegalStateException("Could not open the selected PDF file.")
        }.onFailure { error = it.message ?: "Unable to export business PDF." }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Native business engine · $businessStudioModeTitle", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Normal)
        Text("Privacy-first: inputs stay on this device unless you explicitly export or share output. Finance results are illustrative, not tax, legal, or investment advice.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Studio modes", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            businessStudioModes.forEach { (label, mode) ->
                FilterChip(selected = op == mode, onClick = { selectedBusinessStudioMode = mode; output = ""; error = ""; generationOffset = 0 }, label = { Text(label) }, modifier = Modifier.heightIn(min = 40.dp))
            }
        }
        val financeOperations = setOf("roi", "break-even", "commission", "pricing", "markup", "cash-flow", "salary", "customer-lifetime-value", "customer-acquisition-cost", "recurring-revenue", "expense", "inventory", "discount", "margin", "profit", "payslip")
        if (op in financeOperations) {
            if (op == "customer-lifetime-value") {
                Text("LTV model", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (ltvModel == "simple") Button(onClick = { ltvModel = "simple" }, modifier = Modifier.weight(1f)) { Text("Simple / commerce") }
                    else OutlinedButton(onClick = { ltvModel = "simple" }, modifier = Modifier.weight(1f)) { Text("Simple / commerce") }
                    if (ltvModel == "saas") Button(onClick = { ltvModel = "saas" }, modifier = Modifier.weight(1f)) { Text("SaaS / subscription") }
                    else OutlinedButton(onClick = { ltvModel = "saas" }, modifier = Modifier.weight(1f)) { Text("SaaS / subscription") }
                }
            }
            if (op == "customer-lifetime-value" && ltvModel == "saas") {
                InputField(a, { a = it }, "Monthly ARPU (average revenue per account)", singleLine = true)
                InputField(grossMarginPct, { grossMarginPct = it }, "Gross margin (%)", singleLine = true)
                InputField(monthlyChurnPct, { monthlyChurnPct = it }, "Monthly customer churn (%)", singleLine = true)
            } else {
                InputField(a, { a = it }, when (op) {
                    "roi" -> "Total value received (before subtracting investment)"
                    "break-even" -> "Selling price per unit"
                    "commission" -> "Sales amount"
                    "pricing", "markup" -> "Unit cost before markup"
                    "cash-flow" -> "Cash inflows during period"
                    "salary" -> "Gross annual salary"
                    "customer-lifetime-value" -> "Average order value"
                    "customer-acquisition-cost" -> "Customer acquisition spend"
                    "recurring-revenue" -> "Monthly recurring revenue (MRR)"
                    "expense" -> "Rent / workspace expense"
                    "inventory" -> "Unit cost"
                    "discount" -> "Original price before discount"
                    "margin", "profit" -> "Revenue / sales"
                    "payslip" -> "Gross pay (demo only)"
                    else -> "Amount"
                }, singleLine = true)
                if (op !in setOf("salary")) {
                    InputField(b, { b = it }, when (op) {
                        "roi" -> "Initial investment"
                        "break-even" -> "Fixed costs"
                        "commission" -> "Commission rate (%)"
                        "pricing", "markup" -> "Markup percentage (%)"
                        "cash-flow" -> "Cash outflows during period"
                        "customer-lifetime-value" -> "Purchases per customer / period"
                        "customer-acquisition-cost" -> "New customers acquired"
                        "recurring-revenue" -> "Annual revenue growth (%)"
                        "expense" -> "Payroll / contractor expense"
                        "inventory" -> "Units in stock"
                        "discount" -> "Discount rate (%)"
                        "margin", "profit" -> "Total cost of sales"
                        "payslip" -> "Tax / statutory deductions"
                        else -> "Second value"
                    }, singleLine = true)
                }
                if (op in setOf("break-even", "customer-lifetime-value", "cash-flow", "expense", "inventory", "payslip")) {
                    InputField(c, { c = it }, when (op) {
                        "break-even" -> "Variable cost per unit"
                        "customer-lifetime-value" -> "Customer lifespan (periods)"
                        "cash-flow" -> "Opening cash balance"
                        "expense" -> "Software / subscription expense"
                        "inventory" -> "Reorder quantity target"
                        "payslip" -> "Other deductions"
                        else -> "Third value"
                    }, singleLine = true)
                }
                if (op == "expense") {
                    InputField(d, { d = it }, "Transport / operating expense", singleLine = true)
                    InputField(e, { e = it }, "Other expenses", singleLine = true)
                }
            }
            if (op in setOf("customer-acquisition-cost", "customer-lifetime-value")) {
                InputField(d, { d = it }, if (op == "customer-acquisition-cost") "Customer lifetime value (optional)" else "Customer acquisition cost (optional)", singleLine = true)
                InputField(monthlyContribution, { monthlyContribution = it }, if (op == "customer-lifetime-value" && ltvModel == "saas") "Monthly contribution override (optional)" else "Monthly contribution per customer (optional)", singleLine = true)
            }
            if (op == "break-even") InputField(targetProfit, { targetProfit = it }, "Target profit (optional)", singleLine = true)
        }
        if (op in setOf("invoice", "receipt", "quotation", "estimate", "purchase-order")) {
            InputField(businessName, { businessName = it }, "Business name", singleLine = true)
            OutlinedButton(onClick = { chooseLogoLauncher.launch("image/*") }, modifier = Modifier.fillMaxWidth()) {
                Text(if (logoBitmap == null) "Choose local logo (stays on this device)" else "Change local logo")
            }
            logoBitmap?.let { logo -> Image(bitmap = logo.asImageBitmap(), contentDescription = "Local business logo preview", modifier = Modifier.size(width = 120.dp, height = 64.dp)) }
            InputField(clientName, { clientName = it }, when (op) { "receipt" -> "Received from"; "quotation", "estimate" -> "Prepared for"; "purchase-order" -> "Supplier"; else -> "Bill to / recipient" }, singleLine = true)
            InputField(documentNumber, { documentNumber = it }, "Document number", singleLine = true)
            InputField(documentDate, { documentDate = it }, "Document date", singleLine = true)
            Box(modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = { currencyMenuExpanded = true }, modifier = Modifier.fillMaxWidth()) { Text("Currency: $currency · choose currency") }
                DropdownMenu(expanded = currencyMenuExpanded, onDismissRequest = { currencyMenuExpanded = false }) {
                    listOf("USD", "EUR", "GBP", "NGN", "CAD", "AUD", "INR", "GHS", "KES", "ZAR", "JPY").forEach { code ->
                        DropdownMenuItem(text = { Text(code) }, onClick = { currency = code; currencyMenuExpanded = false })
                    }
                }
            }
            InputField(taxPercent, { taxPercent = it }, "Tax rate (%)", singleLine = true)
            InputField(discountPercent, { discountPercent = it }, "Discount rate (%)", singleLine = true)
            val liveSubtotal = businessLineRows().sumOf { row ->
                val quantity = row.getOrElse(1) { "0" }.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 } ?: 0.0
                val price = row.getOrElse(2) { "0" }.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 } ?: 0.0
                val lineTotal = quantity * price
                if (lineTotal.isFinite()) lineTotal else 0.0
            }
            val liveDiscountRate = (discountPercent.toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0).coerceIn(0.0, 100.0)
            val liveTaxRate = (taxPercent.toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0).coerceAtLeast(0.0)
            val liveDiscount = liveSubtotal * liveDiscountRate / 100.0
            val liveTax = (liveSubtotal - liveDiscount) * liveTaxRate / 100.0
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Live document total · $currency", style = MaterialTheme.typography.titleSmall)
                    Text("Subtotal: ${String.format(java.util.Locale.US, "%.2f", liveSubtotal)}")
                    Text("Discount: −${String.format(java.util.Locale.US, "%.2f", liveDiscount)}")
                    Text("Tax: ${String.format(java.util.Locale.US, "%.2f", liveTax)}")
                    Text("Total: ${String.format(java.util.Locale.US, "%.2f", liveSubtotal - liveDiscount + liveTax)}")
                }
            }
            Text("Line items · description, quantity and unit price", style = MaterialTheme.typography.labelLarge)
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                businessLineRows().forEachIndexed { index, row ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            InputField(row[0], { updateBusinessLineItem(index, 0, it) }, "Item ${index + 1} description", singleLine = true)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Box(modifier = Modifier.weight(1f)) { InputField(row[1], { updateBusinessLineItem(index, 1, it) }, "Quantity", singleLine = true) }
                                Box(modifier = Modifier.weight(1f)) { InputField(row[2], { updateBusinessLineItem(index, 2, it) }, "Unit price", singleLine = true) }
                            }
                            OutlinedButton(onClick = { removeBusinessLineItem(index) }, modifier = Modifier.fillMaxWidth()) { Text("Remove item") }
                        }
                    }
                }
                OutlinedButton(onClick = { addBusinessLineItem() }, modifier = Modifier.fillMaxWidth()) { Text("Add line item") }
            }
        }
        if (op in setOf("agenda", "meeting-agenda", "minutes", "meeting-minutes")) {
            InputField(meetingTitle, { meetingTitle = it }, "Meeting title", singleLine = true)
            InputField(meetingDateTime, { meetingDateTime = it }, "Date and time", singleLine = true)
            InputField(meetingLocation, { meetingLocation = it }, "Location or meeting link", singleLine = true)
            InputField(meetingGoal, { meetingGoal = it }, "Meeting goal", singleLine = true)
            InputField(attendees, { attendees = it }, "Attendees", singleLine = true)
            if (op in setOf("agenda", "meeting-agenda")) {
                InputField(prepNotes, { prepNotes = it }, "Preparation notes", minLines = 2, singleLine = false, tall = true)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Timed agenda items", style = MaterialTheme.typography.labelLarge)
                    val agendaRows = agendaItems.split("\n")
                    agendaRows.forEachIndexed { index, row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.weight(1f)) {
                                InputField(row, { value ->
                                    val updated = agendaItems.split("\n").toMutableList()
                                    if (index in updated.indices) updated[index] = value
                                    agendaItems = updated.joinToString("\n")
                                }, "Item ${index + 1} (topic | minutes)", singleLine = true)
                            }
                            OutlinedButton(onClick = {
                                val updated = agendaItems.split("\n").toMutableList()
                                if (updated.size > 1) updated.removeAt(index) else updated[0] = ""
                                agendaItems = updated.joinToString("\n")
                            }, enabled = agendaRows.size > 1, modifier = Modifier.heightIn(min = 40.dp)) { Text("Remove") }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { if (agendaItems.lines().size < 20) agendaItems = agendaItems.trimEnd() + (if (agendaItems.isBlank()) "" else "\n") + "New agenda item | 5" }, enabled = agendaItems.lines().size < 20, modifier = Modifier.heightIn(min = 40.dp)) { Text("Add timed item") }
                    }
                }
            }
            if (op in setOf("minutes", "meeting-minutes")) {
                InputField(discussionNotes, { discussionNotes = it }, "Discussion notes", minLines = 3, singleLine = false, tall = true)
                InputField(decisions, { decisions = it }, "Decisions", minLines = 2, singleLine = false, tall = true)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Action items (owner | task | due date)", style = MaterialTheme.typography.labelLarge)
                    val actionRows = actionItems.split("\n").filterIndexed { index, row -> index < 20 && (row.isNotBlank() || actionItems.isNotBlank()) }
                    actionRows.forEachIndexed { index, row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.weight(1f)) {
                                InputField(row, { value ->
                                    val updated = actionItems.split("\n").toMutableList()
                                    if (index in updated.indices) updated[index] = value
                                    actionItems = updated.joinToString("\n")
                                }, "Action ${index + 1} (owner | task | due date)", singleLine = true)
                            }
                            OutlinedButton(onClick = {
                                val updated = actionItems.split("\n").toMutableList()
                                if (updated.size > 1) updated.removeAt(index) else updated[0] = ""
                                actionItems = updated.joinToString("\n")
                            }, enabled = actionRows.size > 1, modifier = Modifier.heightIn(min = 40.dp)) { Text("Remove") }
                        }
                    }
                    OutlinedButton(onClick = { if (actionItems.lines().size < 20) actionItems = actionItems.trimEnd() + (if (actionItems.isBlank()) "" else "\n") + " |  | " }, enabled = actionItems.lines().size < 20, modifier = Modifier.heightIn(min = 40.dp)) { Text("Add action item") }
                }
                InputField(nextMeeting, { nextMeeting = it }, "Next meeting", singleLine = true)
            }
        }
        if (op == "payslip") {
            InputField(businessName, { businessName = it }, "Employer / business name", singleLine = true)
            InputField(clientName, { clientName = it }, "Employee name", singleLine = true)
            InputField(payPeriod, { payPeriod = it }, "Pay period", singleLine = true)
        }
        if (op == "email-signature") {
            InputField(signatureName, { signatureName = it }, "Name", singleLine = true)
            InputField(signatureRole, { signatureRole = it }, "Role / title", singleLine = true)
            InputField(signatureEmail, { signatureEmail = it }, "Email", singleLine = true)
            InputField(businessName, { businessName = it }, "Company", singleLine = true)
            InputField(signaturePhone, { signaturePhone = it }, "Phone (optional)", singleLine = true)
            InputField(signatureWebsite, { signatureWebsite = it }, "Website URL (optional)", singleLine = true)
            InputField(signatureSocialLink, { signatureSocialLink = it }, "Social / profile URL (optional)", singleLine = true)
        }
        if (op in setOf("business-name", "company-name", "brand-name", "product-name", "slogan", "sku")) InputField(seed, { seed = it }, "Seed / topic", singleLine = true)
        if (op == "slogan") InputField(audience, { audience = it }, "Audience / context", singleLine = true)
        fun runBusiness() { runCatching { NativeBusinessEngine.run(tool, JSONObject().apply { put("a", a.toDoubleOrNull() ?: 1000.0); put("b", b.toDoubleOrNull() ?: 600.0); put("c", c.toDoubleOrNull() ?: 50.0); put("d", d.toDoubleOrNull() ?: 0.0); put("e", e.toDoubleOrNull() ?: 12.0); put("monthlyContribution", monthlyContribution.toDoubleOrNull() ?: 0.0); put("targetProfit", targetProfit.toDoubleOrNull() ?: 0.0); put("grossMarginPct", grossMarginPct.toDoubleOrNull() ?: 80.0); put("monthlyChurnPct", monthlyChurnPct.toDoubleOrNull() ?: 5.0); put("ltvModel", ltvModel); put("targetProfit", targetProfit.toDoubleOrNull() ?: 0.0); put("lineItems", lineItems); put("company", businessName); put("client", clientName); put("documentNumber", documentNumber); put("date", documentDate); put("currency", currency); put("taxPercent", taxPercent.toDoubleOrNull() ?: 0.0); put("discountPercent", discountPercent.toDoubleOrNull() ?: 0.0); put("seed", seed); put("audience", audience); put("agendaItems", agendaItems); put("name", signatureName); put("role", signatureRole); put("email", signatureEmail); put("phone", signaturePhone); put("website", signatureWebsite); put("socialLink", signatureSocialLink); put("namingStyle", namingStyle); put("maxNameLength", maxNameLength.toDoubleOrNull() ?: 32.0); put("nameBlacklist", nameBlacklist); put("generationOffset", generationOffset); put("meetingTitle", meetingTitle); put("dateTime", meetingDateTime); put("location", meetingLocation); put("meetingGoal", meetingGoal); put("attendees", attendees); put("prepNotes", prepNotes); put("discussionNotes", discussionNotes); put("decisions", decisions); put("actionItems", actionItems); put("nextMeeting", nextMeeting); put("employeeName", clientName); put("payPeriod", payPeriod); put("gross", a.toDoubleOrNull() ?: 1000.0); put("statutoryDeductions", b.toDoubleOrNull() ?: 0.0); put("otherDeductions", c.toDoubleOrNull() ?: 0.0) }, operationOverride = op) }.fold({ output = it; error = "" }, { output = ""; error = it.message ?: "Unable to run business tool" }) }
        if (isNaming) {
            Text("Naming style", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("descriptive" to "Descriptive", "compound" to "Compound", "prefix-suffix" to "Prefix / suffix", "short-brandable" to "Short brandable").forEach { (value, label) ->
                    if (value == namingStyle) Button(onClick = { namingStyle = value }, modifier = Modifier.weight(1f)) { Text(label, maxLines = 2) }
                    else OutlinedButton(onClick = { namingStyle = value }, modifier = Modifier.weight(1f)) { Text(label, maxLines = 2) }
                }
            }
            InputField(maxNameLength, { maxNameLength = it }, "Maximum name length (8–60)", singleLine = true)
            InputField(nameBlacklist, { nameBlacklist = it }, "Exclude words (comma-separated, optional)", singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { generationOffset = 0; runBusiness() }, modifier = Modifier.weight(1f)) { Text("Generate") }
                OutlinedButton(onClick = { generationOffset += 1; runBusiness() }, modifier = Modifier.weight(1f)) { Text("More names") }
            }
            Text("Locally generated ideas only. No trademark, domain, social-handle, or cultural clearance is performed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(
                onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.namecheap.com/domains/"))) }.onFailure { error = "Could not open registrar. Check that a browser is installed." } },
                modifier = Modifier.fillMaxWidth().heightIn(min = 40.dp)
            ) { Text("Check finalists at a registrar ↗") }
            Text("This external link does not verify availability or premium pricing.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (op in setOf("slogan", "sku")) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { generationOffset = 0; runBusiness() }, modifier = Modifier.weight(1f)) { Text("Generate") }
                OutlinedButton(onClick = { generationOffset += 1; runBusiness() }, modifier = Modifier.weight(1f)) { Text("More") }
            }
        }
        OutlinedButton(onClick = { loadBusinessExample() }, modifier = Modifier.fillMaxWidth()) { Text("Load example") }
        ActionRow(
            onRun = { runBusiness() },
            onReset = { a="1000"; b="600"; c="50"; d="0"; e="12"; monthlyContribution="0"; targetProfit="0"; lineItems="Professional service | 1 | 100"; replaceLocalLogo(null); businessName="Your Business"; clientName="Client"; documentNumber="DOC-001"; documentDate=java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date()); currency="USD"; taxPercent="0"; discountPercent="0"; seed="technology"; audience="customers"; agendaItems="Welcome and objectives | 5\nProgress updates | 10\nDecisions and blockers | 15\nActions and next steps | 5"; signatureName="Alex Morgan"; signatureRole="Founder"; signatureEmail="hello@example.com"; signaturePhone=""; signatureWebsite=""; signatureSocialLink=""; namingStyle="descriptive"; maxNameLength="32"; nameBlacklist=""; generationOffset=0; ltvModel="simple"; grossMarginPct="80"; monthlyChurnPct="5"; meetingTitle="Weekly planning"; meetingDateTime=""; meetingLocation=""; meetingGoal="Weekly planning"; attendees="Team"; prepNotes=""; discussionNotes=""; decisions=""; actionItems=""; nextMeeting=""; payPeriod=""; output=""; error="" }
        )
        ResultBox(output, error, ::copy)
        if (isNaming && output.isNotBlank()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Button(onClick = { copy(output) }, modifier = Modifier.fillMaxWidth()) { Text("Copy all names") }
                Text("Copy an individual name", style = MaterialTheme.typography.labelLarge)
                output.lineSequence().filter { it.isNotBlank() }.take(48).forEach { generatedName ->
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(generatedName, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = { copy(generatedName) }) { Text("Copy") }
                    }
                }
            }
        }
        if (output.isNotBlank()) {
            Button(onClick = { savePdfLauncher.launch("env-${op}.pdf") }, modifier = Modifier.fillMaxWidth()) { Text("Download PDF") }
            OutlinedButton(onClick = { saveOutputLauncher.launch("env-${op}.txt") }, modifier = Modifier.fillMaxWidth()) { Text("Download output (.txt)") }
        }
    }
}
