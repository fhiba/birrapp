package com.birrapp

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birrapp.ui.theme.Ink
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.birrapp.auth.BrowserSignInLauncher
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.birrapp.di.AppContainer
import com.birrapp.ui.auth.AuthViewModel
import com.birrapp.ui.bar.AddBarScreen
import com.birrapp.ui.bar.BarDetailScreen
import com.birrapp.ui.bar.BarDetailViewModel
import com.birrapp.ui.list.ListScreen
import com.birrapp.ui.map.MapScreen
import com.birrapp.ui.map.MapViewModel
import com.birrapp.ui.moderation.ModerationScreen
import com.birrapp.ui.moderation.ModerationViewModel
import com.birrapp.ui.profile.AboutScreen
import com.birrapp.ui.profile.ProfileScreen
import com.birrapp.ui.theme.BirrappTheme

class MainActivity : ComponentActivity() {

    /**
     * Código que llega por el deep link al volver del navegador.
     *
     * Se expone como estado y no como evento porque la Activity es
     * `singleTask`: el intent puede llegar por `onNewIntent` con la UI ya
     * compuesta, y hace falta que la composición lo vea.
     */
    private val handoffCode = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as BirrappApplication).container
        readHandoff(intent)

        setContent {
            BirrappTheme {
                BirrappApp(
                    container = container,
                    handoffCode = handoffCode.value,
                    onHandoffConsumed = { handoffCode.value = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readHandoff(intent)
    }

    private fun readHandoff(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "birrapp" && data.host == "auth") {
            handoffCode.value = data.getQueryParameter("handoff")
        }
    }
}

/** Factory mínima: evita traer Hilt para instanciar cinco ViewModels. */
@Suppress("UNCHECKED_CAST")
private fun factory(create: () -> ViewModel) = object : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
}

private object Routes {
    const val MAP = "map"
    const val LIST = "list"
    const val PROFILE = "profile"
    const val MODERATION = "moderation"
    const val ABOUT = "about"
    const val BAR = "bar/{barId}"
    const val ADD_BAR = "addBar/{lat}/{lng}"
    fun bar(id: Long) = "bar/$id"
    fun addBar(lat: Double, lng: Double) = "addBar/$lat/$lng"
}

@Composable
fun BirrappApp(
    container: AppContainer,
    handoffCode: String? = null,
    onHandoffConsumed: () -> Unit = {},
) {
    val navController = rememberNavController()

    val authViewModel: AuthViewModel = viewModel(
        factory = factory { AuthViewModel(container.api, container.session, container.googleSignIn) }
    )
    val authState by authViewModel.state.collectAsState()

    LaunchedEffect(handoffCode) {
        handoffCode?.let { authViewModel.redeemHandoff(it); onHandoffConsumed() }
    }

    // Un solo MapViewModel compartido entre mapa y lista: cambiar el orden en
    // una pantalla tiene que verse reflejado en la otra.
    val mapViewModel: MapViewModel = viewModel(
        factory = factory { MapViewModel(container.bars, container.location) }
    )
    val mapState by mapViewModel.state.collectAsState()

    // El ViewModel no abre el navegador: entrega la URL y la pantalla la
    // consume. Así el ViewModel no depende de Android ni de una Activity.
    val context = LocalContext.current
    LaunchedEffect(authState.browserUrl) {
        authState.browserUrl?.let { url ->
            BrowserSignInLauncher(context).launch(url)
            authViewModel.browserUrlConsumed()
        }
    }

    var showDeleteAccount by remember { mutableStateOf(false) }
    var showSignOut by remember { mutableStateOf(false) }
    // Segundo paso del borrado: escribir la palabra. Un diálogo sólo se
    // acepta por reflejo; escribir obliga a leer.
    var deleteConfirmText by remember { mutableStateOf("") }

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route

    // Durante una transición la ruta puede venir null por un frame, y con el
    // chequeo directo la barra desaparecía y volvía: eso es el parpadeo al
    // entrar y salir del perfil. Se recuerda la última pestaña conocida para
    // que la selección no se pierda entre frames.
    val tabs = remember { setOf(Routes.MAP, Routes.LIST, Routes.PROFILE) }
    var lastTab by rememberSaveable { mutableStateOf(Routes.MAP) }
    LaunchedEffect(currentRoute) {
        if (currentRoute in tabs) lastTab = currentRoute!!
    }
    val showBottomBar = currentRoute == null || currentRoute in tabs

    Box(Modifier.fillMaxSize().background(Ink.Base)) {
        NavHost(
            navController = navController,
            startDestination = Routes.MAP,
        ) {
            composable(Routes.MAP) {
                MapScreen(
                    viewModel = mapViewModel,
                    onBarClick = { navController.navigate(Routes.bar(it)) },
                    onAddBar = { lat, lng ->
                        if (authState.user != null) {
                            navController.navigate(Routes.addBar(lat, lng))
                        } else {
                            navController.navigate(Routes.PROFILE)
                        }
                    },
                )
            }

            composable(Routes.LIST) {
                ListScreen(mapViewModel) { navController.navigate(Routes.bar(it)) }
            }

            composable(Routes.ABOUT) {
                AboutScreen { navController.popBackStack() }
            }

            composable(Routes.PROFILE) {
                // Credential Manager necesita una Activity para anclar su
                // diálogo; con el context de la app falla al abrir el selector.
                val activity = LocalActivity.current
                ProfileScreen(
                    user = authState.user,
                    signingIn = authState.signingIn,
                    authError = authState.error,
                    stats = authState.stats,
                    onOpenAbout = { navController.navigate(Routes.ABOUT) },
                    onDeleteAccount = { showDeleteAccount = true },
                    onSignIn = { activity?.let(authViewModel::signIn) },
                    onSignInBrowser = authViewModel::signInWithBrowser,
                    onSignOut = { showSignOut = true },
                    onOpenModeration = { navController.navigate(Routes.MODERATION) },
                )
            }

            composable(Routes.MODERATION) {
                val vm: ModerationViewModel = viewModel(
                    factory = factory { ModerationViewModel(container.api) }
                )
                ModerationScreen(vm) { navController.popBackStack() }
            }

            composable(
                Routes.BAR,
                arguments = listOf(navArgument("barId") { type = NavType.LongType }),
            ) { entry ->
                val barId = entry.arguments?.getLong("barId") ?: return@composable
                val vm: BarDetailViewModel = viewModel(
                    key = "bar-$barId",
                    factory = factory {
                        BarDetailViewModel(
                            container.api, barId,
                            mapState.center.first, mapState.center.second,
                        )
                    },
                )
                BarDetailScreen(
                    viewModel = vm,
                    isSignedIn = authState.user != null,
                    isModerator = authState.user?.isModerator == true,
                    onBack = { navController.popBackStack() },
                    onNeedSignIn = { navController.navigate(Routes.PROFILE) },
                    onBarDeleted = {
                        mapViewModel.reloadAfterChange()
                        navController.popBackStack()
                    },
                )
            }

            composable(
                Routes.ADD_BAR,
                arguments = listOf(
                    navArgument("lat") { type = NavType.FloatType },
                    navArgument("lng") { type = NavType.FloatType },
                ),
            ) { entry ->
                val lat = entry.arguments?.getFloat("lat")?.toDouble() ?: return@composable
                val lng = entry.arguments?.getFloat("lng")?.toDouble() ?: return@composable
                AddBarScreen(
                    api = container.api,
                    lat = lat, lng = lng,
                    onBack = { navController.popBackStack() },
                    onOpenBar = { id ->
                        navController.popBackStack()
                        navController.navigate(Routes.bar(id))
                    },
                    onDone = {
                        // Se invalida la región cacheada: el bar nuevo puede
                        // estar fuera de lo que ya se había traído.
                        mapViewModel.reloadAfterChange()
                        navController.popBackStack()
                    },
                )
            }
        }

        if (showSignOut) {
            AlertDialog(
                onDismissRequest = { showSignOut = false },
                containerColor = Ink.Raised,
                title = { Text("¿Cerrar sesión?", color = Ink.Cream) },
                text = {
                    Text(
                        "Vas a poder seguir mirando el mapa, pero no cargar " +
                            "precios hasta que vuelvas a entrar.",
                        color = Ink.Muted,
                    )
                },
                confirmButton = {
                    TextButton(onClick = {
                        showSignOut = false
                        authViewModel.signOut()
                    }) { Text("Cerrar sesión", color = Ink.Danger) }
                },
                dismissButton = {
                    TextButton(onClick = { showSignOut = false }) {
                        Text("Cancelar", color = Ink.Muted)
                    }
                },
            )
        }

        if (showDeleteAccount) {
            AlertDialog(
                onDismissRequest = { showDeleteAccount = false },
                containerColor = Ink.Raised,
                title = { Text("¿Borrar tu cuenta?", color = Ink.Cream) },
                text = {
                    Column {
                        Text(
                            "Se borra tu cuenta, tus reseñas y tu sesión. No se puede " +
                            "deshacer.\n\n" +
                                "Los precios que cargaste quedan en el mapa, pero sin tu " +
                            "nombre: son datos sobre bares, no sobre vos, y borrarlos " +
                            "dejaría peor informado a todo el mundo.",
                            color = Ink.Muted,
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "Escribí BORRAR para confirmar",
                            color = Ink.Faint, fontSize = 12.sp,
                        )
                        Spacer(Modifier.height(6.dp))
                        OutlinedTextField(
                            value = deleteConfirmText,
                            onValueChange = { deleteConfirmText = it },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Ink.Danger,
                                unfocusedBorderColor = Ink.Hairline,
                                focusedTextColor = Ink.Cream,
                                unfocusedTextColor = Ink.Cream,
                                cursorColor = Ink.Danger,
                            ),
                        )
                    }
                },
                confirmButton = {
                    val armed = deleteConfirmText.trim().uppercase() == "BORRAR"
                    TextButton(
                        enabled = armed,
                        onClick = {
                            showDeleteAccount = false
                            deleteConfirmText = ""
                            authViewModel.deleteAccount { navController.navigate(Routes.MAP) }
                        },
                    ) {
                        Text(
                            "Borrar cuenta",
                            color = if (armed) Ink.Danger else Ink.Faint,
                        )
                    }
                },
                dismissButton = {
                    TextButton(onClick = {
                        showDeleteAccount = false
                        deleteConfirmText = ""
                    }) { Text("Cancelar", color = Ink.Muted) }
                },
            )
        }

        if (showBottomBar) {
            // Degradado detrás de la barra: sin esto el contenido que scrollea
            // por debajo queda tajeado en seco contra el borde de la píldora.
            // Con el fade se lee como que pasa por abajo, que es la intención.
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(130.dp)
                    .background(
                        Brush.verticalGradient(
                            0f to Color.Transparent,
                            0.55f to Ink.Base.copy(alpha = 0.85f),
                            1f to Ink.Base,
                        )
                    )
            )
            FloatingNav(
                current = lastTab,
                isModerator = authState.user?.isModerator == true,
                onSelect = { route ->
                    navController.navigate(route) {
                        launchSingleTop = true
                        restoreState = true
                        popUpTo(Routes.MAP) { saveState = true }
                    }
                },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

/**
 * Barra de navegación flotante.
 *
 * No es un `NavigationBar` de Material: ese es un bloque opaco anclado al
 * borde que le come 80dp al mapa. Esta flota, deja ver el mapa por debajo y
 * es lo que hace que la app no se vea como una plantilla de Material.
 */
@Composable
private fun FloatingNav(
    current: String?,
    isModerator: Boolean,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier.navigationBarsPadding().padding(bottom = 14.dp)) {
        Row(
            Modifier
                .clip(RoundedCornerShape(50))
                .background(Ink.Raised.copy(alpha = 0.92f))
                .border(
                    0.8.dp,
                    Brush.verticalGradient(
                        listOf(
                            Color.White.copy(alpha = 0.22f),
                            Color.White.copy(alpha = 0.05f),
                        )
                    ),
                    RoundedCornerShape(50),
                )
                .padding(5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NavItem(Icons.Default.Place, stringResource(R.string.tab_map),
                current == Routes.MAP) { onSelect(Routes.MAP) }
            NavItem(Icons.AutoMirrored.Filled.List, stringResource(R.string.tab_list),
                current == Routes.LIST) { onSelect(Routes.LIST) }
            NavItem(Icons.Default.Person, stringResource(R.string.tab_profile),
                current == Routes.PROFILE) { onSelect(Routes.PROFILE) }
        }
    }
}

/** Seleccionado = píldora con etiqueta; el resto, sólo ícono. */
@Composable
private fun NavItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(if (selected) Ink.Amber else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = if (selected) 16.dp else 18.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            icon, label,
            Modifier.size(19.dp),
            tint = if (selected) Ink.Base else Ink.Muted,
        )
        if (selected) {
            Spacer(Modifier.width(7.dp))
            Text(label, color = Ink.Base, style = MaterialTheme.typography.labelLarge)
        }
    }
}
