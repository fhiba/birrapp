package news.inkan.birrapp.ui.moderation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import news.inkan.birrapp.R
import news.inkan.birrapp.data.api.ApiClient
import news.inkan.birrapp.data.model.BarPin
import news.inkan.birrapp.data.model.Flag

data class ModerationUiState(
    val pendingBars: List<BarPin> = emptyList(),
    val flags: List<Flag> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

class ModerationViewModel(private val api: ApiClient) : ViewModel() {
    private val _state = MutableStateFlow(ModerationUiState())
    val state = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching { api.pendingBars() to api.openFlags() }
                .onSuccess { (bars, flags) ->
                    _state.update {
                        it.copy(pendingBars = bars, flags = flags, loading = false)
                    }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun approveBar(id: Long) = act { api.approveBar(id) }
    fun rejectBar(id: Long) = act { api.rejectBar(id) }
    fun resolveFlag(id: Long) = act { api.resolveFlag(id) }
    fun approvePrice(id: Long) = act { api.approvePrice(id) }
    fun removePrice(id: Long) = act { api.removePrice(id) }

    private fun act(block: suspend () -> Any) {
        viewModelScope.launch {
            runCatching { block() }
                .onSuccess { load() }
                .onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModerationScreen(viewModel: ModerationViewModel, onBack: () -> Unit) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.tab_moderation)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver")
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())

            state.error?.let {
                Text(it, Modifier.align(Alignment.Center).padding(24.dp),
                    color = MaterialTheme.colorScheme.error)
            }

            if (!state.loading && state.pendingBars.isEmpty() && state.flags.isEmpty()) {
                Text(
                    stringResource(R.string.nothing_pending),
                    Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            LazyColumn(Modifier.fillMaxSize()) {
                if (state.pendingBars.isNotEmpty()) {
                    item { SectionHeader(stringResource(R.string.pending_bars)) }
                    items(state.pendingBars, key = { "bar-${it.id}" }) { bar ->
                        Column(Modifier.padding(16.dp, 8.dp)) {
                            Text(bar.name, fontWeight = FontWeight.Medium)
                            Text("%.5f, %.5f".format(bar.lat, bar.lng), fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { viewModel.approveBar(bar.id) }) {
                                    Text(stringResource(R.string.approve), fontSize = 13.sp)
                                }
                                OutlinedButton(onClick = { viewModel.rejectBar(bar.id) }) {
                                    Text(stringResource(R.string.reject), fontSize = 13.sp)
                                }
                            }
                        }
                        HorizontalDivider()
                    }
                }

                if (state.flags.isNotEmpty()) {
                    item { SectionHeader(stringResource(R.string.open_flags)) }
                    items(state.flags, key = { "flag-${it.id}" }) { flag ->
                        Column(Modifier.padding(16.dp, 8.dp)) {
                            Text("${flag.targetType} #${flag.targetId}",
                                fontWeight = FontWeight.Medium, fontSize = 14.sp)
                            Text(flag.reason, fontSize = 13.sp)
                            flag.targetSummary?.let {
                                Text("→ $it", fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Spacer(Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                // Un precio retenido por outlier se publica o se
                                // descarta desde acá.
                                if (flag.targetType == "price") {
                                    Button(onClick = {
                                        viewModel.approvePrice(flag.targetId)
                                        viewModel.resolveFlag(flag.id)
                                    }) { Text("Publicar", fontSize = 13.sp) }
                                    OutlinedButton(onClick = {
                                        viewModel.removePrice(flag.targetId)
                                        viewModel.resolveFlag(flag.id)
                                    }) { Text("Descartar", fontSize = 13.sp) }
                                } else {
                                    Button(onClick = { viewModel.resolveFlag(flag.id) }) {
                                        Text(stringResource(R.string.resolve), fontSize = 13.sp)
                                    }
                                }
                            }
                        }
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        Modifier.padding(16.dp, 20.dp, 16.dp, 8.dp),
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
    )
}
