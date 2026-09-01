package com.birrapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
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
import com.birrapp.ui.theme.Ink
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
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
import com.birrapp.ui.profile.ProfileScreen
import com.birrapp.ui.theme.BirrappTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as BirrappApplication).container

        setContent {
            BirrappTheme { BirrappApp(container) }
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
    const val BAR = "bar/{barId}"
    const val ADD_BAR = "addBar/{lat}/{lng}"
    fun bar(id: Long) = "bar/$id"
    fun addBar(lat: Double, lng: Double) = "addBar/$lat/$lng"
}

@Composable
fun BirrappApp(container: AppContainer) {
    val navController = rememberNavController()

    val authViewModel: AuthViewModel = viewModel(
        factory = factory { AuthViewModel(container.api, container.session, container.googleSignIn) }
    )
    val authState by authViewModel.state.collectAsState()

    // Un solo MapViewModel compartido entre mapa y lista: cambiar el orden en
    // una pantalla tiene que verse reflejado en la otra.
    val mapViewModel: MapViewModel = viewModel(
        factory = factory { MapViewModel(container.bars, container.location) }
    )
    val mapState by mapViewModel.state.collectAsState()

    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route
    val showBottomBar = currentRoute in setOf(Routes.MAP, Routes.LIST, Routes.PROFILE)

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

            composable(Routes.PROFILE) {
                ProfileScreen(
                    user = authState.user,
                    signingIn = authState.signingIn,
                    authError = authState.error,
                    onSignIn = authViewModel::signIn,
                    onSignOut = authViewModel::signOut,
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
                    onBack = { navController.popBackStack() },
                    onNeedSignIn = { navController.navigate(Routes.PROFILE) },
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
                    onDone = {
                        mapViewModel.load(force = true)
                        navController.popBackStack()
                    },
                )
            }
        }

        if (showBottomBar) {
            FloatingNav(
                current = currentRoute,
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
