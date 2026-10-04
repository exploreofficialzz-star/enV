package com.chastech.env

import android.content.ClipData
import android.content.ClipboardManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.chastech.env.data.Catalog
import com.chastech.env.data.FavoritesStore
import com.chastech.env.data.ToolRecord
import com.chastech.env.data.featuredOrPopular
import com.chastech.env.data.search
import com.chastech.env.engine.NativeTextEngine
import com.chastech.env.ui.EnVTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private val Teal = Color(0xFF0D9F8A)
private val LightSurface = Color(0xFFF8FAF9)
private val SoftTeal = Color(0xFFE1F4EF)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val favorites = FavoritesStore(applicationContext)
        setContent { EnVTheme { CatalogGate(favorites) } }
    }
}

@Composable
private fun CatalogGate(favorites: FavoritesStore) {
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
        val loaded = result.getOrNull()
        if (loaded == null) loadFailed = true else catalog = loaded
    }

    when {
        catalog != null -> EnVApp(catalog!!, favorites)
        loadFailed -> CatalogFailureScreen { retryCount += 1 }
        else -> NativeLaunchScreen()
    }
}

@Composable
private fun NativeLaunchScreen() {
    Surface(Modifier.fillMaxSize(), color = LightSurface) {
        Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("enV", style = MaterialTheme.typography.displaySmall, color = Teal, fontWeight = FontWeight.Bold)
            Text("Useful tools, ready when you are.", color = Color.Gray, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun CatalogFailureScreen(onRetry: () -> Unit) {
    Surface(Modifier.fillMaxSize(), color = LightSurface) {
        Column(Modifier.fillMaxSize().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("enV", style = MaterialTheme.typography.headlineLarge, color = Teal, fontWeight = FontWeight.Bold)
            Text("The offline catalog couldn't be opened.", modifier = Modifier.padding(top = 12.dp))
            Button(onClick = onRetry, modifier = Modifier.padding(top = 16.dp)) { Text("Retry") }
        }
    }
}

private enum class AppTab(val label: String) { Home("Home"), Tools("Tools"), Search("Search"), Saved("Saved"), Account("Account") }

@Composable
private fun EnVApp(catalog: Catalog, favorites: FavoritesStore) {
    var tab by rememberSaveable { mutableStateOf(AppTab.Home.name) }
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var favoriteIds by remember { mutableStateOf(favorites.getFavorites()) }
    val selected = selectedId?.let { id -> catalog.tools.find { it.id == id } }

    if (selected != null) {
        BackHandler { selectedId = null }
        ToolDetail(tool = selected, isFavorite = selected.id in favoriteIds, onBack = { selectedId = null }, onToggleFavorite = {
            favoriteIds = favorites.toggle(selected.id)
        })
        return
    }
    if (category != null) BackHandler { category = null }

    val currentTab = AppTab.entries.firstOrNull { it.name == tab } ?: AppTab.Home
    Scaffold(
        containerColor = LightSurface,
        topBar = { TopAppBar(title = { Text("enV", fontWeight = FontWeight.Bold) }, colors = TopAppBarDefaults.topAppBarColors(containerColor = LightSurface)) },
        bottomBar = {
            BottomAppBar(containerColor = Color.White, modifier = Modifier.navigationBarsPadding()) {
                AppTab.entries.forEach { item ->
                    NavigationBarItem(selected = currentTab == item, onClick = { tab = item.name; if (item != AppTab.Search) query = "" }, icon = { Icon(item.icon(), contentDescription = item.label) }, label = { Text(item.label) })
                }
            }
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when (currentTab) {
                AppTab.Home -> HomeScreen(catalog, favoriteIds, query, { query = it; tab = AppTab.Search.name }, category, { category = it; tab = AppTab.Tools.name }, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                AppTab.Tools -> ToolsScreen(catalog, category, favoriteIds, { category = it }, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                AppTab.Search -> SearchScreen(catalog, query, category, favoriteIds, { query = it }, { category = it }, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                AppTab.Saved -> SavedScreen(catalog, favoriteIds, { selectedId = it }, { favoriteIds = favorites.toggle(it) })
                AppTab.Account -> AccountScreen(catalog)
            }
        }
    }
}

private fun AppTab.icon() = when (this) {
    AppTab.Home -> Icons.Default.Home
    AppTab.Tools -> Icons.Default.Build
    AppTab.Search -> Icons.Default.Search
    AppTab.Saved -> Icons.Default.Favorite
    AppTab.Account -> Icons.Default.AccountCircle
}

@Composable
private fun HomeScreen(catalog: Catalog, favorites: Set<String>, query: String, onSearch: (String) -> Unit, category: String?, onCategory: (String?) -> Unit, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        item { Text("Make space for useful tools.", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
        item { Text("Browse the catalog offline. Native tool execution is being added by category.", color = Color.Gray) }
        item { SearchBox(query, onSearch, "Search 10,001 tools") }
        item { SectionTitle("Featured and popular") }
        item { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { catalog.featuredOrPopular().forEach { tool -> ToolCard(tool, tool.id in favorites, onTool, onToggleFavorite) } } }
        item { SectionTitle("Browse categories") }
        item { CategoryGrid(catalog, category, onCategory) }
        item { Text("${catalog.counts.total} tools · ${catalog.counts.categories} categories · catalog available offline", color = Color.Gray, modifier = Modifier.padding(vertical = 8.dp)) }
    }
}

@Composable
private fun ToolsScreen(catalog: Catalog, category: String?, favorites: Set<String>, onCategory: (String?) -> Unit, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Text("Tools", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
        CategoryGrid(catalog, category, onCategory, compact = true)
        val list = catalog.search("", category)
        ToolList(list, favorites, onTool, onToggleFavorite, Modifier.weight(1f), emptyMessage = "No tools in this category")
    }
}

@Composable
private fun SearchScreen(catalog: Catalog, query: String, category: String?, favorites: Set<String>, onQuery: (String) -> Unit, onCategory: (String?) -> Unit, onTool: (String) -> Unit, onToggleFavorite: (String) -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Text("Search", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp))
        SearchBox(query, onQuery, "Search names, descriptions, tags")
        CategoryGrid(catalog, category, onCategory, compact = true)
        val results = catalog.search(query, category)
        Text("${results.size} results", color = Color.Gray, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
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
        SettingCard("Offline catalog", "${catalog.counts.total} tools are bundled on this device", Icons.Default.Build)
        SettingCard("Favorites", "Stored locally with SharedPreferences", Icons.Default.Favorite)
        SettingCard("Migration status", "40 text tools run natively. Other active tool engines are still being ported.", Icons.Default.Tune)
        SettingCard("About enV", "Version 1.1.0 (6) · native Android", Icons.Default.Settings)
    }
}

@Composable
private fun ToolDetail(tool: ToolRecord, isFavorite: Boolean, onBack: () -> Unit, onToggleFavorite: () -> Unit) {
    Scaffold(containerColor = LightSurface, topBar = { TopAppBar(title = { Text(tool.name, maxLines = 1, overflow = TextOverflow.Ellipsis) }, navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back") } }, actions = { IconButton(onClick = onToggleFavorite, modifier = Modifier.semantics { contentDescription = if (isFavorite) "Remove from saved" else "Save tool" }) { Icon(if (isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, null, tint = Teal) } }) }) { padding ->
        Column(Modifier.padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            StatusPill(tool.status)
            Text(tool.description, style = MaterialTheme.typography.bodyLarge)
            DetailRow("Category", tool.category)
            DetailRow("Engine", "${tool.engine.type} · ${tool.engine.id}")
            DetailRow("Native execution", when {
                tool.status == "planned" -> "Coming soon"
                tool.engine.type == "text" && NativeTextEngine.operationForTool(tool.id) != null -> "Available offline"
                else -> "Not ported yet"
            })
            DetailRow("Web version", if (tool.clientSide) "Runs in the browser" else "Uses backend services")
            if (tool.status == "planned") Text("This tool is planned and not available yet.", color = Teal, fontWeight = FontWeight.SemiBold)
            else if (tool.engine.type == "text" && NativeTextEngine.operationForTool(tool.id) != null) NativeTextToolForm(tool.id)
            else Text("Native engine migration status: not yet ported. This shell does not claim active-engine parity.", color = Color.Gray)
            if (tool.tags.isNotEmpty()) Text("Tags: ${tool.tags.joinToString()}", color = Color.Gray)
        }
    }
}

@Composable
private fun NativeTextToolForm(toolId: String) {
    val context = LocalContext.current
    val op = NativeTextEngine.operationForTool(toolId) ?: return
    var input by rememberSaveable(toolId) { mutableStateOf("") }
    var compare by rememberSaveable(toolId) { mutableStateOf("") }
    var output by rememberSaveable(toolId) { mutableStateOf("") }
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
            OutlinedTextField(find, { find = it }, Modifier.fillMaxWidth(), label = { Text("Find") })
            OutlinedTextField(replacement, { replacement = it }, Modifier.fillMaxWidth(), label = { Text("Replace with") })
        }
        if (op == "wrap") OutlinedTextField(width, { width = it }, Modifier.fillMaxWidth(), label = { Text("Column width") }, singleLine = true)
        if (op == "list") {
            Text("Style", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("bullets", "numbered", "comma").forEach { value -> FilterChip(selected = style == value, onClick = { style = value }, label = { Text(value.replaceFirstChar { it.uppercase() }) }) } }
        }
        if (op == "keyword-density") OutlinedTextField(keyword, { keyword = it }, Modifier.fillMaxWidth(), label = { Text("Keyword (optional)") })
        OutlinedTextField(input, { input = it }, Modifier.fillMaxWidth().height(if (diff) 180.dp else 160.dp), label = { Text(if (counter) "Text" else "Input") }, minLines = 5)
        if (diff) OutlinedTextField(compare, { compare = it }, Modifier.fillMaxWidth().height(180.dp), label = { Text("New text") }, minLines = 5)
        if (op == "reading-time-calculator") OutlinedTextField(wpm, { wpm = it }, Modifier.fillMaxWidth(), label = { Text("Reading speed (words/min)") }, singleLine = true)
        if (op == "word-counter" || op == "character-counter") OutlinedTextField(limit, { limit = it }, Modifier.fillMaxWidth(), label = { Text("Target limit") }, singleLine = true)
        if (counter) {
            Text("${stats.words} words · ${stats.characters} characters · ${stats.sentences} sentences · ${stats.paragraphs} paragraphs", color = Teal, fontWeight = FontWeight.SemiBold)
            Text("${if (op == "word-counter") stats.words else if (op == "character-counter") stats.characters else if (op == "sentence-counter") stats.sentences else if (op == "paragraph-counter") stats.paragraphs else stats.readingMinutes} ${if (op == "reading-time-calculator") "min" else "matched"} · ${stats.readingMinutes} min reading time", color = Color.Gray)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { output = runCatching { NativeTextEngine.run(toolId, input, compare, options) }.getOrElse { "Error: ${it.message ?: "Unable to run tool"}" } }) { Text("Run") }
            Button(onClick = { input = ""; compare = ""; output = ""; find = ""; replacement = ""; width = "80"; style = "bullets"; keyword = ""; wpm = "200"; limit = "280" }) { Text("Reset") }
        }
        if (output.isNotEmpty()) Surface(color = Color.White, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
                Text(output, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) { Button(onClick = { copy(output) }) { Text("Copy output") } }
            }
        }
    }
}

@Composable
private fun ToolList(tools: List<ToolRecord>, favorites: Set<String>, onTool: (String) -> Unit, onToggle: (String) -> Unit, modifier: Modifier = Modifier, emptyMessage: String = "Nothing to show") {
    if (tools.isEmpty()) Box(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Text(emptyMessage, color = Color.Gray, modifier = Modifier.padding(32.dp)) }
    else LazyColumn(modifier, contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { items(tools, key = { it.id }) { tool -> ToolCard(tool, tool.id in favorites, onTool, onToggle) } }
}

@Composable
private fun ToolCard(tool: ToolRecord, favorite: Boolean, onTool: (String) -> Unit, onToggle: (String) -> Unit) {
    Card(Modifier.fillMaxWidth().clickable { onTool(tool.id) }, colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(18.dp)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Text(tool.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis); Spacer(Modifier.width(8.dp)); if (tool.status == "planned") StatusPill("planned") }
                Text(tool.description, color = Color.Gray, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                Text("${tool.category} · popularity ${tool.popularity}", style = MaterialTheme.typography.labelSmall, color = Teal, modifier = Modifier.padding(top = 8.dp))
            }
            IconButton(onClick = { onToggle(tool.id) }, modifier = Modifier.semantics { contentDescription = if (favorite) "Remove ${tool.name} from saved" else "Save ${tool.name}" }) { Icon(if (favorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, null, tint = Teal) }
        }
    }
}

@Composable
private fun CategoryGrid(catalog: Catalog, selected: String?, onSelected: (String?) -> Unit, compact: Boolean = false) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 20.dp)) {
        if (!compact) AssistChip(onClick = { onSelected(null) }, label = { Text("All") }, leadingIcon = { Icon(Icons.Default.Build, null) })
        catalog.categories.forEach { category -> FilterChip(selected = selected == category.id, onClick = { onSelected(if (selected == category.id) null else category.id) }, label = { Text(category.name) }) }
    }
}

@Composable
private fun SearchBox(value: String, onValueChange: (String) -> Unit, placeholder: String) {
    OutlinedTextField(value = value, onValueChange = onValueChange, modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).semantics { contentDescription = placeholder }, placeholder = { Text(placeholder) }, leadingIcon = { Icon(Icons.Default.Search, "Search") }, singleLine = true, shape = RoundedCornerShape(16.dp))
}

@Composable private fun SectionTitle(text: String) { Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp)) }
@Composable private fun StatusPill(status: String) { Surface(color = if (status == "planned") Color(0xFFFFF0D7) else SoftTeal, shape = RoundedCornerShape(20.dp)) { Text(if (status == "planned") "Coming soon" else "Catalog", color = if (status == "planned") Color(0xFF986700) else Teal, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp)) } }
@Composable private fun DetailRow(label: String, value: String) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, color = Color.Gray); Text(value, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 12.dp)) } }
@Composable private fun SettingCard(title: String, detail: String, icon: androidx.compose.ui.graphics.vector.ImageVector) { Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Icon(icon, title, tint = Teal); Column(Modifier.padding(start = 14.dp)) { Text(title, fontWeight = FontWeight.SemiBold); Text(detail, color = Color.Gray) } } } }
