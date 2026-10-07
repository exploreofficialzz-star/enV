@file:OptIn(
    androidx.compose.material3.ExperimentalMaterial3Api::class,
    androidx.compose.foundation.layout.ExperimentalLayoutApi::class
)

package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import com.chastech.env.data.Catalog
import com.chastech.env.data.FavoritesStore
import com.chastech.env.data.ToolRecord
import com.chastech.env.data.featuredOrPopular
import com.chastech.env.data.fromJson
import com.chastech.env.data.search
import com.chastech.env.engine.NativeCalculatorEngine
import com.chastech.env.engine.NativeCodecEngine
import com.chastech.env.engine.NativeColorEngine
import com.chastech.env.engine.NativeConverterEngine
import com.chastech.env.engine.NativeDateTimeEngine
import com.chastech.env.engine.NativeExpansionCalculatorEngine
import com.chastech.env.engine.NativeMathExerciseEngine
import com.chastech.env.engine.NativeMimeEngine
import com.chastech.env.engine.NativeTextEngine
import com.chastech.env.engine.NativeUtilityEngine
import com.chastech.env.ui.ChasTechnologiesLogo
import com.chastech.env.ui.EnVIcon
import com.chastech.env.ui.EnVLogo
import com.chastech.env.ui.EnVTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate

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

private enum class AppTab { Home, Tools, Search, Saved, Account, Assistant }

@Composable
private fun EnVApp(catalog: Catalog, favorites: FavoritesStore, darkMode: Boolean, themeMode: String, onUseSystemTheme: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(AppTab.Home.name) }
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var showExchange by rememberSaveable { mutableStateOf(false) }
    var showInformation by rememberSaveable { mutableStateOf(false) }
    var overflowExpanded by rememberSaveable { mutableStateOf(false) }
    var favoriteIds by remember { mutableStateOf(favorites.getFavorites()) }
    var assistantMessages by remember { mutableStateOf(emptyList<AssistantChatMessage>()) }
    val selected = selectedId?.let { id -> catalog.tools.find { it.id == id } }
    if (selected != null) BackHandler { selectedId = null }
    else if (category != null) BackHandler { category = null }
    else if (showExchange || showInformation) BackHandler { showExchange = false; showInformation = false }
    else if (tab == AppTab.Assistant.name) BackHandler { tab = AppTab.Home.name }
    val currentTab = AppTab.entries.firstOrNull { it.name == tab } ?: AppTab.Home
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = { tab = AppTab.Home.name; selectedId = null; category = null; showExchange = false; showInformation = false }, modifier = Modifier.semantics { contentDescription = "Home" }) {
                        EnVIcon("Home", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                actions = {
                    IconButton(onClick = { tab = AppTab.Saved.name; selectedId = null; showExchange = false; showInformation = false }, modifier = Modifier.semantics { contentDescription = "Saved tools" }) {
                        EnVIcon("Heart", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = { tab = AppTab.Tools.name; selectedId = null; showExchange = false; showInformation = false }, modifier = Modifier.semantics { contentDescription = "Tools" }) {
                        EnVIcon("LayoutGrid", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Box {
                        IconButton(onClick = { overflowExpanded = true }, modifier = Modifier.semantics { contentDescription = "More options" }) {
                            Column(verticalArrangement = Arrangement.spacedBy(3.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                repeat(3) { Box(Modifier.size(4.dp).background(MaterialTheme.colorScheme.onSurfaceVariant, CircleShape)) }
                            }
                        }
                        DropdownMenu(expanded = overflowExpanded, onDismissRequest = { overflowExpanded = false }) {
                            DropdownMenuItem(text = { Text("AI assistant") }, onClick = { tab = AppTab.Assistant.name; selectedId = null; category = null; showExchange = false; showInformation = false; overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Account") }, onClick = { tab = AppTab.Account.name; selectedId = null; showExchange = false; showInformation = false; overflowExpanded = false })
                            DropdownMenuItem(text = { Text("Search tools") }, onClick = { tab = AppTab.Search.name; selectedId = null; showExchange = false; showInformation = false; overflowExpanded = false })
                    }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (selected != null) {
                ToolDetail(tool = selected, isFavorite = selected.id in favoriteIds, onBack = { selectedId = null }, onToggleFavorite = { favoriteIds = favorites.toggle(selected.id) })
            } else {
                when (currentTab) {
                    AppTab.Home -> HomeScreen(catalog, favoriteIds, query, { query = it }, { category = null; tab = AppTab.Search.name }, darkMode, { selectedId = it }, { favoriteIds = favorites.toggle(it) }, { selectedId = null; category = null; tab = AppTab.Assistant.name })
                    AppTab.Assistant -> AssistantScreen(assistantMessages, { assistantMessages = it })
                    AppTab.Tools -> ToolsScreen(catalog, category, favoriteIds, query, { query = it }, { category = it }, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                    AppTab.Search -> SearchScreen(catalog, query, category, favoriteIds, { query = it }, { category = it }, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                    AppTab.Saved -> SavedScreen(catalog, favoriteIds, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                    AppTab.Account -> when {
                        showExchange -> ContactExchangeScreen { showExchange = false }
                        showInformation -> CompanyInformationScreen { showInformation = false }
                        else -> AccountScreen(
                            catalog = catalog,
                            themeMode = themeMode,
                            onUseSystemTheme = onUseSystemTheme,
                            onOpenExchange = { showExchange = true },
                            onOpenInformation = { showInformation = true },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(catalog: Catalog, favorites: Set<String>, query: String, onQuery: (String) -> Unit, onSearch: () -> Unit, darkMode: Boolean, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit, onAssistant: () -> Unit) {
    val trending = remember(catalog) { catalog.tools.sortedByDescending { it.popularity }.take(6) }
    val suggestions = remember(catalog, query) { if (query.isBlank()) emptyList() else catalog.search(query).take(5) }
    var homeSearchFocused by remember { mutableStateOf(false) }
    LazyColumn(contentPadding = PaddingValues(start = 16.dp, top = 4.dp, end = 16.dp, bottom = 0.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                EnVLogo(Modifier.padding(bottom = 2.dp).width(142.dp).height(56.dp), darkTheme = darkMode, homeHero = true)
                OutlinedTextField(
                    value = query,
                    onValueChange = onQuery,
                    modifier = Modifier.fillMaxWidth().onFocusChanged { homeSearchFocused = it.isFocused },
                    placeholder = { if (!homeSearchFocused) Text("Search for a tool") },
                    textStyle = MaterialTheme.typography.bodyLarge.copy(textAlign = TextAlign.Center),
                    leadingIcon = { EnVLogo(Modifier.width(48.dp).height(32.dp), darkTheme = darkMode) },
                    trailingIcon = { IconButton(onClick = onSearch) { EnVIcon("Search", Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary) } },
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { onSearch() }),
                )
                if (query.isNotBlank()) {
                    if (suggestions.isEmpty()) {
                        Text("No matching tools. Try another name or keyword.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp))
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            suggestions.forEach { tool -> ToolCard(tool, tool.id in favorites, onTool, onToggleFavorite) }
                            TextButton(onClick = onSearch, modifier = Modifier.align(Alignment.End)) {
                                Text("See more results", color = MaterialTheme.colorScheme.primary)
                                Spacer(Modifier.width(8.dp))
                                EnVIcon("ArrowRight", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
                Row(modifier = Modifier.fillMaxWidth().padding(start = 20.dp, top = 6.dp, end = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    HomePreviewBar("AI assistant", Modifier.weight(1f), onClick = onAssistant)
                    HomePreviewBar("Total token = 100", Modifier.weight(1f))
                }
                Text("A focused toolkit for\neveryday work.", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.Start, modifier = Modifier.fillMaxWidth())
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionTitle("Trending tools", accent = true)
                trending.forEach { tool -> ToolCard(tool, tool.id in favorites, onTool, onToggleFavorite) }
            }
        }
    }
}

@Composable
private fun ToolsScreen(catalog: Catalog, category: String?, favorites: Set<String>, query: String, onQuery: (String) -> Unit, onCategory: (String?) -> Unit, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit) {
    val visibleCounts = remember { mutableStateMapOf<String, Int>() }
    LaunchedEffect(query) { visibleCounts.clear() }
    val groupedTools = remember(catalog, query, category) {
        if (category != null) emptyList()
        else {
            val byCategory = catalog.search(query).groupBy { it.category }
            catalog.categories.mapNotNull { item -> byCategory[item.id]?.let { item to it } }
        }
    }
    if (category != null) {
        val selectedCategory = catalog.categories.find { it.id == category }
        val categoryTools = remember(catalog, category) { catalog.search("", category) }
        val visibleCount = minOf(visibleCounts[category] ?: 6, categoryTools.size)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 0.dp, end = 4.dp)) {
                        IconButton(onClick = { onCategory(null) }, modifier = Modifier.semantics { contentDescription = "Back to all tools" }) {
                            EnVIcon("ArrowLeft", tint = MaterialTheme.colorScheme.onSurface)
                        }
                Text(selectedCategory?.name ?: "Category", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    }
                    selectedCategory?.description?.takeIf { it.isNotBlank() }?.let {
                        Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (categoryTools.isEmpty()) {
                item { Text("No tools in this category yet.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp)) }
            }
            items(categoryTools.take(visibleCount), key = { it.id }) { tool ->
                ToolCard(tool, tool.id in favorites, onTool, onToggleFavorite)
            }
            if (visibleCount < categoryTools.size) {
                item {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                        TextButton(onClick = { visibleCounts[category] = minOf(visibleCount + 6, categoryTools.size) }) {
                            Text("See more tools", color = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(8.dp))
                            EnVIcon("ChevronDown", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    } else {
        LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 22.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.fillMaxWidth()) {
                        Text("All tools", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
                        OutlinedTextField(
                            value = query,
                            onValueChange = onQuery,
                            modifier = Modifier.width(160.dp).height(56.dp).semantics { contentDescription = "Search all tools" },
                            placeholder = { Text("Search", maxLines = 1, style = MaterialTheme.typography.bodySmall) },
                            leadingIcon = { EnVIcon("Search", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            textStyle = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Text("Browse the complete enV toolkit.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (groupedTools.isEmpty()) {
                item { Text("No tools match your search. Try another name or keyword.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp)) }
            } else {
                items(groupedTools, key = { it.first.id }) { group ->
                    val groupCategory = group.first
                    val tools = group.second
                    val visible = minOf(visibleCounts[groupCategory.id] ?: 3, tools.size)
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Surface(Modifier.size(40.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(8.dp)) {
                                Box(contentAlignment = Alignment.Center) { EnVIcon(groupCategory.icon, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface) }
                            }
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(groupCategory.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                Text(groupCategory.blurb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        tools.take(visible).forEach { tool -> ToolCard(tool, tool.id in favorites, onTool, onToggleFavorite) }
                        if (visible < tools.size) {
                            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                                TextButton(onClick = { visibleCounts[groupCategory.id] = minOf(visible + 6, tools.size) }) {
                                    Text("See more tools", color = MaterialTheme.colorScheme.primary)
                                    Spacer(Modifier.width(8.dp))
                                    EnVIcon("ChevronDown", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchScreen(catalog: Catalog, query: String, category: String?, favorites: Set<String>, onQuery: (String) -> Unit, onCategory: (String?) -> Unit, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Text("Search", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
        SearchBox(query, onQuery, "Search names, descriptions, tags")
        CategoryGrid(catalog, category, onCategory, compact = true)
        val results = catalog.search(query, category)
        Text("${results.size} results", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        ToolList(results, favorites, onTool, onToggleFavorite, Modifier.weight(1f), "Try a different search or category")
    }
}

@Composable
private fun SavedScreen(catalog: Catalog, favorites: Set<String>, onTool: (String) -> Unit, onToggle: (String) -> Unit) {
    val tools = catalog.tools.filter { it.id in favorites }.sortedBy { it.name }
    Column(Modifier.fillMaxSize()) {
        Text("Saved", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(20.dp))
        ToolList(tools, favorites, onTool, onToggle, Modifier.weight(1f), "Save a tool to find it here across restarts.")
    }
}

@Composable
private fun AccountScreen(catalog: Catalog, themeMode: String, onUseSystemTheme: () -> Unit, onOpenExchange: () -> Unit, onOpenInformation: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Account", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Native settings", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        SettingCard(
            "Appearance",
            if (themeMode == "system") "Following device light/dark setting" else "Custom theme active · tap to follow the device",
            "Sun",
            onClick = onUseSystemTheme,
        )
        SettingCard("Offline catalog", "${catalog.counts.total} tools are bundled on this device", "Wrench")
        SettingCard("Favorites", "Stored locally with SharedPreferences", "Heart")
        SettingCard("Instant Contact Exchange", "Nearby peer-to-peer contact sharing with explicit activation and native Contacts saving", "Contact", onClick = onOpenExchange)
        SettingCard("Migration status", "${catalog.tools.count { (it.status == "active" || it.status == "beta") && nativeSupported(it) }} of ${catalog.counts.active} active tools run natively and offline. Web-only tools are never routed through the website.", "Hammer")
        SettingCard("About enV & chAs Technologies LLC", "Company details, policies, and pricing", "Info", onClick = onOpenInformation)
    }
}

@Composable
private fun CompanyInformationScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = "Back to Account" }) {
                EnVIcon("ArrowLeft", tint = MaterialTheme.colorScheme.onSurface)
            }
            Text("About & policies", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        }
        Surface(color = Color.White, shape = RoundedCornerShape(16.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline)) {
            ChasTechnologiesLogo(Modifier.fillMaxWidth().height(112.dp).padding(8.dp))
        }
        InformationSection("About enV", listOf(
            "A focused toolkit for everyday work across Web, Android, and iOS. enV is developed and operated by chAs Technologies LLC, registered in Delaware, USA.",
            "Some tools process information on your device; connected features use the service or provider described for that feature.",
        ))
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Contact", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text("enV product support", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:envtoolkit@gmail.com"))) }) {
                    Text("envtoolkit@gmail.com")
                }
                Text("Company inquiries · chAs Technologies LLC", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:chastechnologiesllc@gmail.com"))) }) {
                    Text("chastechnologiesllc@gmail.com")
                }
            }
        }
        InformationSection("Privacy", listOf(
            "chAs Technologies LLC, the company behind enV, is registered in Delaware, USA.",
            "enV is for people aged 13 or older and is not intended for children under 13. If you are under the age of majority where you live, local parent or guardian permission requirements still apply.",
            "Favorites, recent tools, theme preferences, and the Web contact card are stored locally on your device until you clear app or browser data. Ordinary toolkit use does not require an account.",
            "Some document and media tools upload selected files to the enV service or a processor configured for that deployment. The document endpoint uses a temporary working directory and removes it when the request finishes.",
            "When AI is enabled, the task input is sent through the enV server to the configured provider. Supported providers include Groq, OpenRouter, and Google Gemini; routing and brief result caching depend on deployment settings. Provider retention policies apply.",
            "Optional sign-in may process account and session information. Nearby Contact Exchange sends only the fields enabled in the feature to participating nearby devices while Exchange is active. Saving a received contact requires your separate action and permission.",
            "For privacy requests, email envtoolkit@gmail.com. Provider and infrastructure retention may vary; do not send sensitive information to a connected feature unless you are comfortable with its handling.",
        ))
        InformationSection("Terms of Use", listOf(
            "You must be at least 13 years old to use enV. If you are under the age of majority where you live, use enV only with any parent or guardian permission required by local law.",
            "These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict-of-law principles. Subject to non-waivable consumer rights and mandatory laws that apply where you live, disputes relating to these Terms will be brought in state or federal courts located in Delaware. Nothing here limits a right or remedy that cannot lawfully be waived.",
            "Use enV lawfully and responsibly. You are responsible for your inputs, permissions, and decisions based on tool results. Do not submit material you do not have permission to use or violate another person’s rights.",
            "Outputs may be incomplete, inaccurate, or non-unique. Verify important results before relying on them. Some features depend on third-party services and may change or become unavailable.",
            "Prices are listed in USD. The token schedule is planned only: this app has no token balance, purchase checkout, or reward issuance. When payments are enabled, checkout is intended to convert USD prices to local currency in countries supported by the selected gateway; the final amount and currency will be shown before payment. Availability and conversion rates depend on the provider. Future token, payment, expiry, refund, and eligibility terms will be displayed before activation.",
            "To the extent allowed by applicable law, enV is provided as available and without warranties that cannot be disclaimed. Nothing here limits a right or liability that cannot legally be limited.",
        ))
        InformationSection("Disclaimer", listOf(
            "enV provides general-purpose tools, not legal, medical, mental-health, financial, investment, tax, engineering, or safety-critical advice.",
            "Calculations, generated content, and extracted data may be wrong or incomplete. Check inputs, assumptions, units, and outputs. Do not rely on a result as the sole basis for a high-stakes decision; consult a qualified professional when appropriate.",
            "AI output may be biased, incorrect, incomplete, or similar to other output. Third-party service availability and handling are outside enV’s control.",
        ))
        InformationSection("Responsible Use", listOf(
            "Do not use enV for unlawful activity, fraud, harassment, impersonation, unauthorized access, malware, spam, infringement, or to violate another person’s privacy or rights.",
            "Only submit content you are permitted to use. Review connected-feature notices before sending files or text to a server or AI provider. In Contact Exchange, enable only fields you intend to share with nearby participants.",
            "Keep a person responsible for reviewing results, especially for legal, medical, financial, tax, and safety-critical matters. Report safety or privacy concerns to envtoolkit@gmail.com.",
        ))
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Pricing", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text("Planned pricing — purchases are not available yet. The current app has no token balance, checkout, or referral-award system. Prices are listed in USD; when payments are enabled, checkout is intended to convert them to local currency in countries supported by the gateway and show the final amount and currency before payment.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                listOf("100 tokens" to "$0.30", "300 tokens" to "$0.50", "500 tokens" to "$0.80", "1,000 tokens" to "$1.20", "5,000 tokens" to "$5.00").forEach { (tokens, price) ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(tokens, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(price, fontWeight = FontWeight.SemiBold)
                    }
                }
                Spacer(Modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
                Text("Planned first sign-up bonus: 100 tokens · planned referral reward: 50 tokens. Eligibility and program rules will be published before rewards are enabled.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun InformationSection(title: String, paragraphs: List<String>) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            paragraphs.forEach { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

private fun nativeSupported(tool: ToolRecord): Boolean = when { NativeBackendEngine.supports(tool) -> false; tool.status == "planned" -> false; else -> when (tool.engine.type) {
    "text" -> NativeTextEngine.operationForTool(tool.id) != null
    "codec" -> NativeCodecEngine.operationForTool(tool.id) != null
    "color" -> NativeColorEngine.operationForTool(tool.id) != null
    "datetime" -> NativeDateTimeEngine.operationForTool(tool.id) != null
    "mime" -> NativeMimeEngine.operationForTool(tool.id) != null
    "converter" -> NativeConverterEngine.operationForTool(tool) != null
    "calculator" -> NativeCalculatorEngine.operationForTool(tool.id) != null || NativeExpansionCalculatorEngine.operationForTool(tool.id) != null || NativeMathExerciseEngine.operationForTool(tool.id) != null
    "generator", "network", "seo", "developer", "cssgen" -> NativeUtilityEngine.supports(tool)
    "custom" -> tool.category == "productivity"
    else -> false
    }
}

private fun nativeBackendSupported(tool: ToolRecord): Boolean = NativeBackendEngine.supports(tool)

@Composable
private fun ToolDetail(tool: ToolRecord, isFavorite: Boolean, onBack: () -> Unit, onToggleFavorite: () -> Unit) {
    val supported = nativeSupported(tool)
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = "Back" }) { EnVIcon("ArrowLeft", tint = MaterialTheme.colorScheme.onSurface) }
            Text("Tool details", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            IconButton(onClick = onToggleFavorite, modifier = Modifier.semantics { contentDescription = if (isFavorite) "Remove from saved" else "Save tool" }) {
                EnVIcon("Heart", tint = if (isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Surface(Modifier.size(56.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(10.dp)) {
                Box(contentAlignment = Alignment.Center) { EnVIcon(tool.icon, Modifier.size(24.dp), tint = MaterialTheme.colorScheme.primary) }
            }
            Column(Modifier.padding(start = 12.dp)) {
                Text(tool.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(tool.category, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        val backend = nativeBackendSupported(tool)
        val supported = nativeSupported(tool)
        if (tool.status == "planned" && !supported && !backend) StatusPill("Coming soon")
        else if (tool.status != "planned" && !supported && !backend) StatusPill("Web only")
        Text(tool.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        DetailRow("Engine", "${tool.engine.type} · ${tool.engine.id}")
        DetailRow("Native execution", when { supported -> "Available offline"; backend -> "Available online via enV backend"; tool.status == "planned" -> "Coming soon"; else -> "Web only — no native implementation" })
        DetailRow("Processing", if (backend) "Uses enV backend services" else "Runs on this device")
        when { backend -> NativeBackendToolForm(tool,true); supported -> NativeToolForm(tool); else -> Text("This tool is not yet implemented natively.", color = MaterialTheme.colorScheme.primary) }
        if (NativeAiEngine.supports(tool)) { NativeAiToolForm(tool) }
        if (tool.tags.isNotEmpty()) Text("Tags: ${tool.tags.joinToString()}", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun NativeToolForm(tool: ToolRecord) {
    when (tool.engine.type) {
        "text" -> NativeTextToolForm(tool.id)
        "codec" -> NativeCodecToolForm(tool.id)
        "color" -> NativeColorToolForm(tool.id)
        "datetime" -> NativeDateTimeToolForm(tool.id)
        "mime" -> NativeMimeToolForm(tool.id)
        "converter" -> NativeConverterToolForm(tool)
        "calculator" -> when {
            NativeCalculatorEngine.operationForTool(tool.id) != null -> NativeCalculatorToolForm(tool)
            NativeExpansionCalculatorEngine.operationForTool(tool.id) != null -> NativeExpansionCalculatorToolForm(tool.id)
            NativeMathExerciseEngine.operationForTool(tool.id) != null -> NativeMathExerciseToolForm(tool.id)
            else -> Text("This native calculator engine is not available offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        "generator", "network", "seo", "developer", "cssgen" -> NativeUtilityToolForm(tool)
    "custom" -> if (tool.category == "productivity") NativeProductivityToolForm(tool.id) else Text("This native custom engine is not available offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        else -> Text("This tool is not yet implemented natively.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}


@Composable
private fun NativeProductivityToolForm(toolId:String) {
    var running by rememberSaveable(toolId){ mutableStateOf(false) }
    var elapsed by rememberSaveable(toolId){ mutableStateOf(0L) }
    var phase by rememberSaveable(toolId){ mutableStateOf("focus") }
    var remaining by rememberSaveable(toolId){ mutableStateOf(if(toolId=="pomodoro-timer")1500L else 3000L) }
    LaunchedEffect(running, toolId, phase) { while(running) { kotlinx.coroutines.delay(1000); if(toolId=="stopwatch") elapsed++ else { if(remaining<=1){ phase=if(phase=="focus")"break" else "focus"; remaining=if(toolId=="pomodoro-timer") if(phase=="focus")1500 else 300 else if(phase=="focus")3000 else 600 } else remaining-- } } }
    val display=if(toolId=="stopwatch") String.format("%02d:%02d",elapsed/60,elapsed%60) else String.format("%02d:%02d",remaining/60,remaining%60)
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)){ Text(if(toolId=="stopwatch")"Stopwatch" else if(toolId=="pomodoro-timer")"Pomodoro · ${phase.replaceFirstChar{it.uppercase()}}" else "Focus Timer",style=MaterialTheme.typography.titleMedium); Text(display,style=MaterialTheme.typography.displayLarge); Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){Button({running=!running}){Text(if(running)"Pause" else "Start")}; OutlinedButton({running=false;elapsed=0;phase="focus";remaining=if(toolId=="pomodoro-timer")1500 else 3000}){Text("Reset")}} }
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

@Composable
private fun NativeCalculatorToolForm(tool: ToolRecord) {
    val context = LocalContext.current
    val operation = NativeCalculatorEngine.operationForTool(tool.id) ?: return
    val values = remember(tool.id) { mutableStateMapOf<String, String>().apply { operation.fields.forEach { field -> put(field.name, field.defaultValue) } } }
    var output by rememberSaveable(tool.id) { mutableStateOf("") }
    var error by rememberSaveable(tool.id) { mutableStateOf("") }
    fun copy(text: String) { context.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("enV output", text)) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        operation.formula?.takeIf { it.isNotBlank() }?.let { Text("Formula: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        operation.fields.forEach { field ->
            InputField(values[field.name].orEmpty(), { values[field.name] = it }, field.label, singleLine = true)
        }
        ActionRow(
            onRun = { runCatching { NativeCalculatorEngine.run(operation, values.toMap()) }.fold(
                { rows -> output = rows.joinToString("\n") { row -> "${row.label}: ${row.value}${row.hint?.let { " $it" } ?: ""}" }; error = "" },
                { output = ""; error = it.message ?: "Unable to run calculator" }
            ) },
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
        Text("${op.row.cLabel} = ${op.row.aLabel} ${when(op.row.family) { "product" -> "×"; "ratio" -> "÷"; else -> "+" }} ${op.row.bLabel}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
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
        Text(op.formula, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
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
    val counter = op.endsWith("counter") || op == "reading-time-calculator"
    val diff = op == "text-diff"
    val options = NativeTextEngine.Options(find, replacement, width, style, keyword, limit, wpm)
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
        InputField(input, { input = it }, if (counter) "Text" else "Input", minLines = 5, tall = true)
        if (diff) InputField(compare, { compare = it }, "New text", minLines = 5, tall = true)
        if (op == "reading-time-calculator") InputField(wpm, { wpm = it }, "Reading speed (words/min)", singleLine = true)
        if (op == "word-counter" || op == "character-counter") InputField(limit, { limit = it }, "Target limit", singleLine = true)
        if (counter) {
            Text("${stats.words} words · ${stats.characters} characters · ${stats.sentences} sentences · ${stats.paragraphs} paragraphs", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            Text("${if (op == "word-counter") stats.words else if (op == "character-counter") stats.characters else if (op == "sentence-counter") stats.sentences else if (op == "paragraph-counter") stats.paragraphs else stats.readingMinutes} ${if (op == "reading-time-calculator") "min" else "matched"} · ${stats.readingMinutes} min reading time", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        ActionRow(
            onRun = { runCatching { NativeTextEngine.run(toolId, input, compare, options) }.fold({ output = it; error = "" }, { output = ""; error = it.message ?: "Unable to run tool" }) },
            onReset = { input = ""; compare = ""; output = ""; error = ""; find = ""; replacement = ""; width = "80"; style = "bullets"; keyword = ""; wpm = "200"; limit = "280" }
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
        Text("Optional file inspection", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
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
        Text("Native ${tool.engine.type} engine · op ${op ?: tool.id}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
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
            Text("Result", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
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
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.Top) {
            Row(Modifier.weight(1f).clickable { onTool(tool.id) }, verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Surface(Modifier.size(36.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(6.dp)) {
                        Box(contentAlignment = Alignment.Center) { EnVIcon(tool.icon, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurface) }
                    }
                    Text(tool.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 12.dp))
                    Text(tool.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                    if (tool.status == "planned") {
                        StatusPill("Coming soon", Modifier.padding(top = 10.dp))
                    } else if (tool.clientSide && !tool.requiresBackend) {
                        StatusPill("On device", Modifier.padding(top = 10.dp))
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
            Text(category.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(category.blurb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun SearchBox(value: String, onValueChange: (String) -> Unit, placeholder: String) {
    OutlinedTextField(value, onValueChange, modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).semantics { contentDescription = placeholder }, placeholder = { Text(placeholder) }, leadingIcon = { EnVIcon("Search", tint = MaterialTheme.colorScheme.onSurfaceVariant, contentDescription = "Search") }, singleLine = true, shape = RoundedCornerShape(12.dp))
}

@Composable
private fun HomePreviewBar(label: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Surface(
        modifier = if (onClick == null) modifier.height(40.dp) else modifier.height(40.dp).clickable(onClick = onClick).semantics { contentDescription = "Open AI assistant" },
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(12.dp),
    ) {
        Box(Modifier.fillMaxSize().padding(horizontal = 8.dp), contentAlignment = Alignment.Center) {
            Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center, maxLines = 1, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable private fun SectionTitle(text: String, subtitle: String? = null, accent: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.padding(top = 4.dp)) {
        Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
        subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
@Composable private fun StatusPill(text: String, modifier: Modifier = Modifier) { Surface(modifier = modifier, color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(5.dp)) { Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) } }
@Composable private fun DetailRow(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 12.dp)) } }
@Composable private fun SettingCard(title: String, detail: String, iconName: String, onClick: (() -> Unit)? = null) {
    val modifier = if (onClick == null) Modifier.fillMaxWidth() else Modifier.fillMaxWidth().clickable(onClick = onClick)
    Card(modifier = modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            EnVIcon(iconName, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.padding(start = 14.dp)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
