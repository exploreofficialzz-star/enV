@file:OptIn(
    androidx.compose.material3.ExperimentalMaterial3Api::class,
    androidx.compose.foundation.layout.ExperimentalLayoutApi::class
)

package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chastech.env.data.Catalog
import com.chastech.env.data.FavoritesStore
import com.chastech.env.data.ToolRecord
import com.chastech.env.data.featuredOrPopular
import com.chastech.env.data.fromJson
import com.chastech.env.data.search
import com.chastech.env.engine.NativeCodecEngine
import com.chastech.env.engine.NativeColorEngine
import com.chastech.env.engine.NativeDateTimeEngine
import com.chastech.env.engine.NativeMimeEngine
import com.chastech.env.engine.NativeTextEngine
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
            var darkMode by rememberSaveable { mutableStateOf(false) }
            EnVTheme(darkTheme = darkMode) {
                CatalogGate(favorites, darkMode, onToggleTheme = { darkMode = !darkMode })
            }
        }
    }
}

@Composable
private fun CatalogGate(favorites: FavoritesStore, darkMode: Boolean, onToggleTheme: () -> Unit) {
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
        catalog != null -> EnVApp(catalog!!, favorites, darkMode, onToggleTheme)
        loadFailed -> CatalogFailureScreen { retryCount += 1 }
        else -> NativeLaunchScreen()
    }
}

@Composable
private fun NativeLaunchScreen() {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            EnVLogo(Modifier.width(112.dp).height(75.dp))
            Text("Useful tools, ready when you are.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun CatalogFailureScreen(onRetry: () -> Unit) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            EnVLogo(Modifier.width(112.dp).height(75.dp))
            Text("The offline catalog couldn't be opened.", modifier = Modifier.padding(top = 12.dp))
            Button(onClick = onRetry, modifier = Modifier.padding(top = 16.dp)) { Text("Retry") }
        }
    }
}

private enum class AppTab(val label: String, val iconName: String) {
    Home("Home", "Home"), Tools("Tools", "LayoutGrid"), Search("Search", "Search"),
    Saved("Saved", "Heart"), Account("Account", "User")
}

@Composable
private fun EnVApp(catalog: Catalog, favorites: FavoritesStore, darkMode: Boolean, onToggleTheme: () -> Unit) {
    var tab by rememberSaveable { mutableStateOf(AppTab.Home.name) }
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var favoriteIds by remember { mutableStateOf(favorites.getFavorites()) }
    val selected = selectedId?.let { id -> catalog.tools.find { it.id == id } }
    if (selected != null) BackHandler { selectedId = null }
    else if (category != null) BackHandler { category = null }
    val currentTab = AppTab.entries.firstOrNull { it.name == tab } ?: AppTab.Home
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { EnVLogo(Modifier.width(84.dp).height(56.dp)) },
                actions = {
                    IconButton(onClick = onToggleTheme, modifier = Modifier.semantics { contentDescription = if (darkMode) "Switch to light mode" else "Switch to dark mode" }) {
                        EnVIcon(if (darkMode) "Sun" else "Moon", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        bottomBar = {
            Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.background).navigationBarsPadding()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                Row(Modifier.fillMaxWidth().height(56.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                    AppTab.entries.forEach { item ->
                        val isSelected = currentTab == item
                        Column(
                            Modifier.weight(1f).fillMaxSize().clickable { tab = item.name; selectedId = null; if (item != AppTab.Search) query = "" }.semantics { contentDescription = item.label },
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center,
                        ) {
                            EnVIcon(item.iconName, tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(item.label, style = MaterialTheme.typography.labelSmall, color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (selected != null) {
                ToolDetail(tool = selected, isFavorite = selected.id in favoriteIds, onBack = { selectedId = null }, onToggleFavorite = { favoriteIds = favorites.toggle(selected.id) })
            } else {
                when (currentTab) {
                    AppTab.Home -> HomeScreen(catalog, favoriteIds, { tab = AppTab.Tools.name }, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                    AppTab.Tools -> ToolsScreen(catalog, category, favoriteIds, { category = it }, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                    AppTab.Search -> SearchScreen(catalog, query, category, favoriteIds, { query = it }, { category = it }, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                    AppTab.Saved -> SavedScreen(catalog, favoriteIds, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                    AppTab.Account -> AccountScreen(catalog)
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(catalog: Catalog, favorites: Set<String>, onBrowseTools: () -> Unit, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit) {
    val featured = remember(catalog) { catalog.tools.filter { it.featured }.sortedByDescending { it.popularity }.take(6) }
    val popular = remember(catalog) { catalog.tools.sortedByDescending { it.popularity }.take(6) }
    LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 24.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Private, practical, in-browser tools", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
                Text("A focused toolkit for everyday work.", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.SemiBold)
                Text("Convert, calculate, generate, and transform without sending your files or text away.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(onClick = onBrowseTools, modifier = Modifier.padding(top = 4.dp), shape = RoundedCornerShape(8.dp)) { Text("Browse all tools") }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionTitle("Featured tools", "Hand-picked starting points")
                featured.forEach { tool -> ToolCard(tool, tool.id in favorites, onTool, onToggleFavorite) }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SectionTitle("Popular tools", "Useful tools people return to")
                popular.forEach { tool -> ToolCard(tool, tool.id in favorites, onTool, onToggleFavorite) }
            }
        }
    }
}

@Composable
private fun ToolsScreen(catalog: Catalog, category: String?, favorites: Set<String>, onCategory: (String?) -> Unit, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit) {
    val suggested = remember(catalog) { catalog.search("").take(6) }
    if (category != null) {
        val selectedCategory = catalog.categories.find { it.id == category }
        Column(Modifier.fillMaxSize()) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 8.dp, end = 20.dp, top = 8.dp, bottom = 12.dp)) {
                IconButton(onClick = { onCategory(null) }, modifier = Modifier.semantics { contentDescription = "Back to all tools" }) {
                    EnVIcon("ArrowLeft", tint = MaterialTheme.colorScheme.onSurface)
                }
                Text(selectedCategory?.name ?: "Category", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
            }
            selectedCategory?.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
            }
            ToolList(catalog.search("", category), favorites, onTool, onToggleFavorite, Modifier.weight(1f), "No tools in this category")
        }
    } else {
        LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 22.dp), verticalArrangement = Arrangement.spacedBy(22.dp)) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("All tools", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
                    Text("Browse the complete enV toolkit, including the growing Coming Soon catalog.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SectionTitle("Suggested tools", "Start with a popular tool")
                    suggested.forEach { ToolCard(it, it.id in favorites, onTool, onToggleFavorite) }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    SectionTitle("Browse categories", "Choose a category to explore")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        catalog.categories.forEach { item -> CategoryCard(item, onClick = { onCategory(item.id) }) }
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
private fun AccountScreen(catalog: Catalog) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Account", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("Native settings", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        SettingCard("Offline catalog", "${catalog.counts.total} tools are bundled on this device", "Wrench")
        SettingCard("Favorites", "Stored locally with SharedPreferences", "Heart")
        SettingCard("Migration status", "89 active tools run natively and offline. URL media inspection still needs a remote metadata service.", "Hammer")
        SettingCard("About enV", "Version 1.1.0 (6) · native Android", "Info")
    }
}

private fun nativeSupported(tool: ToolRecord): Boolean = when (tool.engine.type) {
    "text" -> NativeTextEngine.operationForTool(tool.id) != null
    "codec" -> NativeCodecEngine.operationForTool(tool.id) != null
    "color" -> NativeColorEngine.operationForTool(tool.id) != null
    "datetime" -> NativeDateTimeEngine.operationForTool(tool.id) != null
    "mime" -> NativeMimeEngine.operationForTool(tool.id) != null
    else -> false
}

@Composable
private fun ToolDetail(tool: ToolRecord, isFavorite: Boolean, onBack: () -> Unit, onToggleFavorite: () -> Unit) {
    val supported = nativeSupported(tool)
    val remoteOnly = tool.engine.type == "url-media-info"
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
        if (tool.status == "planned") StatusPill(tool.status)
        Text(tool.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        DetailRow("Engine", "${tool.engine.type} · ${tool.engine.id}")
        DetailRow("Native execution", when {
            tool.status == "planned" -> "Coming soon"
            supported -> "Available offline"
            remoteOnly -> "Remote metadata service required"
            else -> "Not ported yet"
        })
        DetailRow("Web version", if (tool.clientSide) "Runs in the browser" else "Uses backend services")
        when {
            tool.status == "planned" -> Text("This tool is planned and not available yet.", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            supported -> NativeToolForm(tool)
            remoteOnly -> Text("URL media inspection requires its remote metadata service and isn't available offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> Text("Native engine migration status: not yet ported. This app does not claim that unsupported IDs execute offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
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
        else -> Text("This native engine is not available offline.", color = MaterialTheme.colorScheme.onSurfaceVariant)
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
        InputField(browserMime, { browserMime = it }, "Browser MIME (optional)", placeholder = "application/pdf")
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
            Column(Modifier.weight(1f).clickable { onTool(tool.id) }) {
                Surface(Modifier.size(36.dp), color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(6.dp)) {
                    Box(contentAlignment = Alignment.Center) { EnVIcon(tool.icon, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary) }
                }
                Text(tool.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 12.dp))
                Text(tool.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                if (tool.status == "planned" || tool.clientSide) {
                    StatusPill(tool.status, Modifier.padding(top = 10.dp))
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
        if (!compact) AssistChip(onClick = { onSelected(null) }, label = { Text("All") }, leadingIcon = { EnVIcon("LayoutGrid", Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary) })
        catalog.categories.forEach { category -> FilterChip(selected = selected == category.id, onClick = { onSelected(if (selected == category.id) null else category.id) }, label = { Text(category.name) }, leadingIcon = { EnVIcon(category.icon, Modifier.size(16.dp), tint = if (selected == category.id) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) }) }
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
                Box(contentAlignment = Alignment.Center) { EnVIcon(category.icon, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary) }
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

@Composable private fun SectionTitle(text: String, subtitle: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.padding(top = 4.dp)) {
        Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
@Composable private fun StatusPill(status: String, modifier: Modifier = Modifier) { Surface(modifier = modifier, color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(5.dp)) { Text(if (status == "planned") "Coming soon" else "IN-BROWSER", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)) } }
@Composable private fun DetailRow(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 12.dp)) } }
@Composable private fun SettingCard(title: String, detail: String, iconName: String) { Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(12.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outline), elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { EnVIcon(iconName, tint = MaterialTheme.colorScheme.primary); Column(Modifier.padding(start = 14.dp)) { Text(title, fontWeight = FontWeight.SemiBold); Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant) } } } }
