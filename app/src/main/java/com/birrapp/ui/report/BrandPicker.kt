package com.birrapp.ui.report

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birrapp.data.model.Brand
import com.birrapp.ui.theme.Ink
import kotlinx.coroutines.launch
import java.text.Normalizer

/**
 * Selector de marca, detrás de un desplegable.
 *
 * Va después del estilo y no antes por una razón de uso: quien carga un precio
 * sabe siempre si es rubia o IPA, y no siempre de qué marca. Primero lo que se
 * sabe seguro; la marca queda como un paso opcional que se puede saltear.
 *
 * "Sin marca" es una opción de primera clase y no un vacío. Hay bares donde la
 * birra no tiene marca declarada, y forzar a elegir una haría que la gente
 * invente. Una birra sin marca es una birra concreta, con su precio y su nota,
 * distinta de la misma canilla con marca conocida.
 */
@Composable
fun BrandField(
    brands: List<Brand>,
    selected: String?,
    onSelect: (String?) -> Unit,
    onCreate: suspend (String) -> Brand,
) {
    var open by remember { mutableStateOf(false) }
    val brand = brands.firstOrNull { it.slug == selected }

    // Compacto y a la izquierda, no una barra de ancho completo: con ancho
    // completo competía visualmente con el monto, que es lo único que esta
    // pantalla tiene que hacer grande. La marca es un atributo del estilo que
    // se acaba de elegir, no un campo del mismo peso.
    Row(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (brand != null) Ink.AmberSoft else Color.White.copy(alpha = 0.06f))
            .clickable { open = true }
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            brand?.name ?: "Sin marca",
            color = if (brand != null) Ink.Amber else Ink.Muted,
            style = MaterialTheme.typography.labelLarge,
            fontSize = 12.5.sp,
            maxLines = 1,
        )
        Spacer(Modifier.width(6.dp))
        Icon(
            Icons.Default.KeyboardArrowDown, null,
            Modifier.size(15.dp),
            tint = if (brand != null) Ink.Amber else Ink.Muted,
        )
    }

    if (open) {
        BrandSheet(
            brands = brands,
            selected = selected,
            onDismiss = { open = false },
            onPick = { onSelect(it); open = false },
            onCreate = onCreate,
            onCreated = { onSelect(it.slug); open = false },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BrandSheet(
    brands: List<Brand>,
    selected: String?,
    onDismiss: () -> Unit,
    onPick: (String?) -> Unit,
    onCreate: suspend (String) -> Brand,
    onCreated: (Brand) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val typed = query.trim()
    val shown = remember(brands, query) {
        val needle = fold(typed)
        if (needle.isEmpty()) brands else brands.filter { fold(it.name).contains(needle) }
    }
    // Sólo si lo escrito no coincide con algo que ya existe: sin esto la
    // pantalla ofrece crear "Antares" teniendo Antares en la lista, que es
    // justo el duplicado que el vocabulario controlado viene a evitar.
    val canCreate = typed.length >= 2 && brands.none { fold(it.name) == fold(typed) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Ink.Raised,
        dragHandle = { BottomSheetDefaults.DragHandle(color = Ink.Faint) },
    ) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text(
                "Marca",
                style = MaterialTheme.typography.titleLarge,
                color = Ink.Cream,
            )
            Spacer(Modifier.height(14.dp))

            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Ink.Base)
                    .padding(horizontal = 13.dp, vertical = 12.dp),
            ) {
                if (query.isEmpty()) {
                    Text("Buscar marca", color = Ink.Faint, fontSize = 14.sp)
                }
                BasicTextField(
                    value = query,
                    onValueChange = { if (it.length <= 60) query = it },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyMedium.copy(color = Ink.Cream),
                    cursorBrush = SolidColor(Ink.Amber),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = Ink.Danger, fontSize = 13.sp)
            }

            if (canCreate) {
                Spacer(Modifier.height(10.dp))
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(13.dp))
                        .background(if (busy) Ink.AmberDeep else Ink.Amber)
                        .clickable(enabled = !busy) {
                            busy = true; error = null
                            scope.launch {
                                runCatching { onCreate(typed) }
                                    .onSuccess { onCreated(it) }
                                    .onFailure { error = it.message; busy = false }
                            }
                        }
                        .padding(vertical = 13.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "Agregar \"$typed\"",
                        color = Ink.Base,
                        style = MaterialTheme.typography.labelLarge,
                        fontSize = 13.5.sp,
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "La podés usar al toque; un moderador la revisa después.",
                    color = Ink.Faint, fontSize = 11.5.sp, lineHeight = 16.sp,
                )
            }

            Spacer(Modifier.height(8.dp))

            // La lista se limita en alto para que el teclado no la empuje
            // fuera de la pantalla al buscar.
            LazyColumn(Modifier.heightIn(max = 340.dp)) {
                item {
                    BrandOption(
                        label = "Sin marca",
                        hint = "No la sé o el bar no la declara",
                        on = selected == null,
                        onClick = { onPick(null) },
                    )
                }

                val craft = shown.filter { it.craft }
                val industrial = shown.filterNot { it.craft }

                if (craft.isNotEmpty()) item { SectionLabel("Artesanales") }
                items(craft, key = { it.slug }) {
                    BrandOption(it.name, null, selected == it.slug) { onPick(it.slug) }
                }
                if (industrial.isNotEmpty()) item { SectionLabel("Industriales") }
                items(industrial, key = { it.slug }) {
                    BrandOption(it.name, null, selected == it.slug) { onPick(it.slug) }
                }

                if (shown.isEmpty() && !canCreate) {
                    item {
                        Text(
                            "Ninguna marca coincide.",
                            Modifier.padding(vertical = 12.dp),
                            color = Ink.Muted, fontSize = 14.sp,
                        )
                    }
                }
            }

        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text.uppercase(),
        Modifier.padding(top = 16.dp, bottom = 4.dp),
        style = MaterialTheme.typography.labelLarge,
        color = Ink.Faint, fontSize = 10.sp, letterSpacing = 1.3.sp,
    )
}

@Composable
private fun BrandOption(label: String, hint: String?, on: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (on) Ink.AmberSoft else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                label,
                color = if (on) Ink.Amber else Ink.Cream,
                style = MaterialTheme.typography.labelLarge,
                fontSize = 14.sp,
            )
            hint?.let {
                Text(it, color = Ink.Faint, fontSize = 11.5.sp)
            }
        }
        if (on) {
            Icon(Icons.Default.Check, null, Modifier.size(17.dp), tint = Ink.Amber)
        }
    }
}

/** Minúsculas y sin acentos: "Peñón" tiene que encontrarse escribiendo "penon". */
private fun fold(s: String): String =
    Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
