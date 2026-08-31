package com.birrapp.ui.bar

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import com.birrapp.R
import com.birrapp.data.api.ApiClient
import com.birrapp.data.model.NewBarRequest

/**
 * Alta de bar. Queda `pending` hasta que un moderador lo apruebe — si no,
 * el mapa se llena de bares inventados y duplicados.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddBarScreen(
    api: ApiClient,
    lat: Double,
    lng: Double,
    onBack: () -> Unit,
    onDone: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.new_bar)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver")
                    }
                },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).padding(20.dp)) {
            Text(
                "Ubicación: %.5f, %.5f".format(lat, lng),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.drop_pin),
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Spacer(Modifier.height(20.dp))
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.take(200) },
                label = { Text(stringResource(R.string.bar_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = address,
                onValueChange = { address = it.take(300) },
                label = { Text(stringResource(R.string.bar_address)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            error?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }

            Spacer(Modifier.height(24.dp))
            Button(
                onClick = {
                    sending = true; error = null
                    scope.launch {
                        runCatching {
                            api.addBar(
                                NewBarRequest(
                                    name = name.trim(), lat = lat, lng = lng,
                                    address = address.trim().ifBlank { null },
                                )
                            )
                        }.onSuccess {
                            sending = false
                            snackbar.showSnackbar("Listo. Un moderador lo revisa.")
                            onDone()
                        }.onFailure { e ->
                            sending = false
                            error = e.message
                        }
                    }
                },
                enabled = name.isNotBlank() && !sending,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (sending) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                else Text(stringResource(R.string.send))
            }
        }
    }
}
