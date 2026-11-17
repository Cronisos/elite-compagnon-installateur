// Catalogue des commandes du jeu, en français : nom de chaque commande du fichier .binds, son intention (« piloter »,
// « combattre »…) pour les reclasser, et où la trouver dans le menu Commandes du jeu (Options › Commandes). Ces
// emplacements sont APPROXIMATIFS : déduits de l'ordre du fichier .binds, que le jeu écrit dans l'ordre de son menu ;
// les intitulés exacts du menu français viendront des captures du joueur (rendus « exacts » un par un).
// Noms anglais d'appoint : EDRefCard (Richard Buckle, licence MIT, voir CREDITS.md). Données seulement, sans accès disque.

/** Intentions du joueur, dans l'ordre d'affichage. */
export const INTENTIONS = [
  { id: 'piloter', titre: 'Piloter', icone: '✈', description: 'Rotation, poussée, gaz, assistance de vol' },
  { id: 'voyager', titre: 'Voyager', icone: '➤', description: 'FSD, supercroisière, cartes, route' },
  { id: 'atterrir', titre: 'Atterrir et apponter', icone: '⤓', description: 'Train, commandes d’atterrissage' },
  { id: 'combattre', titre: 'Combattre', icone: '⚔', description: 'Armes, ciblage, contre-mesures, énergie' },
  { id: 'explorer', titre: 'Explorer', icone: '◎', description: 'Scanners FSS et DSS, codex' },
  { id: 'soute', titre: 'Soute et minage', icone: '⛏', description: 'Écope, larguer la cargaison' },
  { id: 'interface', titre: 'Panneaux et interface', icone: '▤', description: 'Panneaux du cockpit, menus' },
  { id: 'vrs', titre: 'Conduire le VRS', icone: '⛟', description: 'Conduite, tourelle, VRS' },
  { id: 'a-pied', titre: 'À pied', icone: '🚶', description: 'Déplacement, armes, outils, émotes' },
  { id: 'equipage', titre: 'Équipage et chasseur', icone: '⛨', description: 'Équipage multiple, ordres au chasseur' },
  { id: 'camera', titre: 'Caméras et photo', icone: '◫', description: 'Vue libre, caméras, mode photo' },
  { id: 'colonisation', titre: 'Colonisation', icone: '▣', description: 'Placer une construction' },
  { id: 'divers', titre: 'Divers', icone: '…', description: 'Le reste' },
  { id: 'reglages', titre: 'Réglages', icone: '⚙', description: 'Sensibilités, zones mortes, modes de la souris' },
];

/**
 * Sections du menu Commandes, par la première entrée de chacune dans le fichier .binds (même ordre que le menu) :
 * une entrée appartient à la dernière section commencée avant elle dans le fichier du joueur. Intitulés approximatifs.
 */
export const SECTIONS = [
  ['MouseXMode', 'Commandes du vaisseau', 'Commandes de la souris'],
  ['YawAxisRaw', 'Commandes du vaisseau', 'Rotation en vol'],
  ['LateralThrustRaw', 'Commandes du vaisseau', 'Poussée en vol'],
  ['UseAlternateFlightValuesToggle', 'Commandes du vaisseau', 'Commandes de vol alternatives'],
  ['ThrottleAxis', 'Commandes du vaisseau', 'Manette des gaz'],
  ['YawAxis_Landing', 'Commandes du vaisseau', 'Commandes d’atterrissage'],
  ['ToggleFlightAssist', 'Commandes du vaisseau', 'Vol : divers'],
  ['SelectTarget', 'Commandes du vaisseau', 'Ciblage'],
  ['PrimaryFire', 'Commandes du vaisseau', 'Armes'],
  ['ToggleButtonUpInput', 'Commandes du vaisseau', 'Refroidissement'],
  ['ShipSpotLightToggle', 'Commandes du vaisseau', 'Divers'],
  ['UIFocus', 'Commandes du vaisseau', 'Changements de mode'],
  ['UI_Up', 'Commandes générales', 'Mode interface'],
  ['MouseHeadlook', 'Commandes du vaisseau', 'Vue libre (tête)'],
  ['CamPitchAxis', 'Commandes générales', 'Carte de la galaxie'],
  ['ToggleDriveAssist', 'Commandes du VRS', 'Conduite'],
  ['BuggyPrimaryFireButton', 'Commandes du VRS', 'Ciblage et armes'],
  ['MouseTurretXMode', 'Commandes du VRS', 'Tourelle'],
  ['DriveSpeedAxis', 'Commandes du VRS', 'Accélérateur'],
  ['IncreaseEnginesPower_Buggy', 'Commandes du VRS', 'Divers'],
  ['UIFocus_Buggy', 'Commandes du VRS', 'Changements de mode'],
  ['MultiCrewToggleMode', 'Commandes du vaisseau', 'Équipage multiple'],
  ['OrderRequestDock', 'Commandes du vaisseau', 'Ordres au chasseur'],
  ['PhotoCameraToggle', 'Commandes générales', 'Suite caméra'],
  ['FreeCamToggleHUD', 'Commandes générales', 'Caméra libre'],
  ['CommanderCreator_Undo', 'Commandes générales', 'Holo-Me'],
  ['GalnetAudio_Play_Pause', 'Commandes générales', 'Audio de la GalNet'],
  ['ExplorationFSSCameraPitch', 'Commandes du vaisseau', 'Scanner de système (FSS)'],
  ['ExplorationSAAChangeScannedAreaViewToggle', 'Commandes du vaisseau', 'Scanner de surface (DSS)'],
  ['MouseHumanoidXMode', 'Commandes à pied', 'Déplacement'],
  ['HumanoidPrimaryFireButton', 'Commandes à pied', 'Combat'],
  ['HumanoidToggleFlashlightButton', 'Commandes à pied', 'Équipement et outils'],
  ['GalaxyMapOpen_Humanoid', 'Commandes à pied', 'Changements de mode'],
  ['StoreEnableRotation', 'Commandes générales', 'Boutique (aperçu)'],
  ['HumanoidEmoteSlot1', 'Commandes à pied', 'Émotes'],
  ['PlaceSettlement', 'Commandes générales', 'Colonisation : placement'],
];

// Noms français des commandes (boutons et axes) et des réglages, par nom de balise du .binds
export const NOMS = {
  // Souris (vaisseau)
  MouseXMode: 'Souris : axe X', MouseXDecay: 'Souris : retour au centre de l’axe X', MouseYMode: 'Souris : axe Y',
  MouseYDecay: 'Souris : retour au centre de l’axe Y', MouseReset: 'Recentrer la souris', MouseSensitivity: 'Sensibilité de la souris',
  MouseDecayRate: 'Vitesse de retour au centre', MouseDeadzone: 'Zone morte de la souris', MouseLinearity: 'Linéarité de la souris',
  MouseGUI: 'Souris dans l’interface', BlockMouseDecay: 'Bloquer le retour au centre de la souris',
  // Rotation
  YawAxisRaw: 'Lacet (axe)', YawLeftButton: 'Lacet à gauche', YawRightButton: 'Lacet à droite', YawToRollMode: 'Lacet vers roulis (mode)',
  YawToRollSensitivity: 'Lacet vers roulis (sensibilité)', YawToRollMode_FAOff: 'Lacet vers roulis, assistance coupée',
  YawToRollButton: 'Lacet vers roulis', RollAxisRaw: 'Roulis (axe)', RollLeftButton: 'Roulis à gauche', RollRightButton: 'Roulis à droite',
  PitchAxisRaw: 'Tangage (axe)', PitchUpButton: 'Tangage vers le haut', PitchDownButton: 'Tangage vers le bas',
  // Poussée
  LateralThrustRaw: 'Poussée latérale (axe)', LeftThrustButton: 'Poussée à gauche', RightThrustButton: 'Poussée à droite',
  VerticalThrustRaw: 'Poussée verticale (axe)', UpThrustButton: 'Poussée vers le haut', DownThrustButton: 'Poussée vers le bas',
  AheadThrust: 'Poussée avant (axe)', ForwardThrustButton: 'Poussée avant', BackwardThrustButton: 'Poussée arrière',
  // Vol alternatif
  UseAlternateFlightValuesToggle: 'Commandes de vol alternatives', YawAxisAlternate: 'Lacet (alternatif)',
  RollAxisAlternate: 'Roulis (alternatif)', PitchAxisAlternate: 'Tangage (alternatif)',
  LateralThrustAlternate: 'Poussée latérale (alternative)', VerticalThrustAlternate: 'Poussée verticale (alternative)',
  // Gaz
  ThrottleAxis: 'Manette des gaz (axe)', ThrottleRange: 'Plage de la manette des gaz', ToggleReverseThrottleInput: 'Inverser la poussée',
  ForwardKey: 'Accélérer', BackwardKey: 'Ralentir', ThrottleIncrement: 'Pas de la manette des gaz',
  SetSpeedMinus100: 'Gaz : -100 %', SetSpeedMinus75: 'Gaz : -75 %', SetSpeedMinus50: 'Gaz : -50 %', SetSpeedMinus25: 'Gaz : -25 %',
  SetSpeedZero: 'Gaz : arrêt (0 %)', SetSpeed25: 'Gaz : 25 %', SetSpeed50: 'Gaz : 50 %', SetSpeed75: 'Gaz : 75 %', SetSpeed100: 'Gaz : 100 %',
  // Atterrissage
  YawAxis_Landing: 'Lacet, atterrissage (axe)', YawLeftButton_Landing: 'Lacet à gauche, atterrissage',
  YawRightButton_Landing: 'Lacet à droite, atterrissage', YawToRollMode_Landing: 'Lacet vers roulis, atterrissage',
  PitchAxis_Landing: 'Tangage, atterrissage (axe)', PitchUpButton_Landing: 'Tangage vers le haut, atterrissage',
  PitchDownButton_Landing: 'Tangage vers le bas, atterrissage', RollAxis_Landing: 'Roulis, atterrissage (axe)',
  RollLeftButton_Landing: 'Roulis à gauche, atterrissage', RollRightButton_Landing: 'Roulis à droite, atterrissage',
  LateralThrust_Landing: 'Poussée latérale, atterrissage (axe)', LeftThrustButton_Landing: 'Poussée à gauche, atterrissage',
  RightThrustButton_Landing: 'Poussée à droite, atterrissage', VerticalThrust_Landing: 'Poussée verticale, atterrissage (axe)',
  UpThrustButton_Landing: 'Poussée vers le haut, atterrissage', DownThrustButton_Landing: 'Poussée vers le bas, atterrissage',
  AheadThrust_Landing: 'Poussée avant, atterrissage (axe)', ForwardThrustButton_Landing: 'Poussée avant, atterrissage',
  BackwardThrustButton_Landing: 'Poussée arrière, atterrissage',
  // Vol : divers
  ToggleFlightAssist: 'Assistance de vol (activer / couper)', UseBoostJuice: 'Boost', HyperSuperCombination: 'Hyperespace / supercroisière (FSD)',
  Supercruise: 'Supercroisière', Hyperspace: 'Saut hyperespace', DisableRotationCorrectToggle: 'Correction de rotation',
  OrbitLinesToggle: 'Lignes d’orbite',
  // Ciblage
  SelectTarget: 'Cibler devant', CycleNextTarget: 'Contact suivant', CyclePreviousTarget: 'Contact précédent',
  SelectHighestThreat: 'Cibler la plus grande menace', CycleNextHostileTarget: 'Hostile suivant', CyclePreviousHostileTarget: 'Hostile précédent',
  TargetWingman0: 'Cibler l’ailier 1', TargetWingman1: 'Cibler l’ailier 2', TargetWingman2: 'Cibler l’ailier 3',
  SelectTargetsTarget: 'Cibler la cible de l’ailier', WingNavLock: 'Verrouillage de navigation sur l’ailier',
  CycleNextSubsystem: 'Sous-système suivant', CyclePreviousSubsystem: 'Sous-système précédent', TargetNextRouteSystem: 'Prochain système de la route',
  // Armes
  PrimaryFire: 'Tir principal (groupe 1)', SecondaryFire: 'Tir secondaire (groupe 2)', CycleFireGroupNext: 'Groupe de tir suivant',
  CycleFireGroupPrevious: 'Groupe de tir précédent', DeployHardpointToggle: 'Sortir / rentrer les points d’emport',
  DeployHardpointsOnFire: 'Sortir les points d’emport en tirant',
  // Refroidissement
  ToggleButtonUpInput: 'Mode silencieux', DeployHeatSink: 'Dissipateur thermique',
  // Divers (vaisseau)
  ShipSpotLightToggle: 'Phares', RadarRangeAxis: 'Portée des capteurs (axe)', RadarIncreaseRange: 'Augmenter la portée des capteurs',
  RadarDecreaseRange: 'Réduire la portée des capteurs', IncreaseEnginesPower: 'Énergie aux moteurs (MOT)', IncreaseWeaponsPower: 'Énergie aux armes (ARM)',
  IncreaseSystemsPower: 'Énergie aux systèmes (SYS)', ResetPowerDistribution: 'Équilibrer l’énergie (RAZ)', HMDReset: 'Recentrer le casque VR',
  ToggleCargoScoop: 'Écope de cargaison', EjectAllCargo: 'Larguer toute la cargaison', LandingGearToggle: 'Train d’atterrissage',
  MicrophoneMute: 'Micro (couper / activer)', MuteButtonMode: 'Mode du bouton micro', CqcMuteButtonMode: 'Mode du bouton micro (CQC)',
  UseShieldCell: 'Cellule de bouclier (SCB)', FireChaffLauncher: 'Lance-paillettes', TriggerFieldNeutraliser: 'Neutraliseur de champ',
  ChargeECM: 'Contre-mesures électroniques (ECM)', EnableRumbleTrigger: 'Vibrations des gâchettes', EnableMenuGroups: 'Groupes de menus',
  WeaponColourToggle: 'Couleur des armes', EngineColourToggle: 'Couleur des moteurs', NightVisionToggle: 'Vision nocturne',
  TriggerColonisationModule: 'Module de colonisation',
  // Changements de mode
  UIFocus: 'Focus interface', UIFocusMode: 'Mode du focus interface', FocusLeftPanel: 'Panneau de navigation (gauche)',
  FocusCommsPanel: 'Panneau de communication (haut)', FocusOnTextEntryField: 'Focus sur la saisie de texte', QuickCommsPanel: 'Communications rapides',
  FocusRadarPanel: 'Panneau de rôle (bas)', FocusRightPanel: 'Panneau des systèmes (droite)', LeftPanelFocusOptions: 'Options du panneau gauche',
  CommsPanelFocusOptions: 'Options du panneau de communication', RolePanelFocusOptions: 'Options du panneau de rôle',
  RightPanelFocusOptions: 'Options du panneau droit', EnableCameraLockOn: 'Verrouillage de la caméra',
  GalaxyMapOpen: 'Carte de la galaxie', SystemMapOpen: 'Carte du système', ShowPGScoreSummaryInput: 'Score CQC', HeadLookToggle: 'Vue libre (activer / couper)',
  Pause: 'Menu principal (pause)', FriendsMenu: 'Amis', OpenCodexGoToDiscovery: 'Codex', PlayerHUDModeToggle: 'Mode du HUD (combat / analyse)',
  ExplorationFSSEnter: 'Ouvrir le scanner de système (FSS)',
  // Interface
  UI_Up: 'Interface : haut', UI_Down: 'Interface : bas', UI_Left: 'Interface : gauche', UI_Right: 'Interface : droite',
  UI_Select: 'Interface : valider', UI_Back: 'Interface : retour', UI_Toggle: 'Interface : basculer', CycleNextPanel: 'Onglet suivant',
  CyclePreviousPanel: 'Onglet précédent', CycleNextPage: 'Page suivante', CyclePreviousPage: 'Page précédente',
  // Vue libre (tête)
  MouseHeadlook: 'Vue libre à la souris', MouseHeadlookInvert: 'Vue libre à la souris inversée', MouseHeadlookSensitivity: 'Sensibilité de la vue libre (souris)',
  HeadlookDefault: 'Vue libre par défaut', HeadlookIncrement: 'Pas de la vue libre', HeadlookMode: 'Mode de la vue libre',
  HeadlookResetOnToggle: 'Recentrer la vue libre à l’activation', HeadlookSensitivity: 'Sensibilité de la vue libre', HeadlookSmoothing: 'Lissage de la vue libre',
  HeadLookReset: 'Recentrer la vue libre', HeadLookPitchUp: 'Regarder en haut', HeadLookPitchDown: 'Regarder en bas', HeadLookPitchAxisRaw: 'Regarder haut / bas (axe)',
  HeadLookYawLeft: 'Regarder à gauche', HeadLookYawRight: 'Regarder à droite', HeadLookYawAxis: 'Regarder gauche / droite (axe)',
  MotionHeadlook: 'Vue libre par suivi de la tête', HeadlookMotionSensitivity: 'Sensibilité du suivi de la tête', yawRotateHeadlook: 'Lacet par la vue libre',
  // Carte de la galaxie
  CamPitchAxis: 'Carte : tangage (axe)', CamPitchUp: 'Carte : tangage haut', CamPitchDown: 'Carte : tangage bas', CamYawAxis: 'Carte : lacet (axe)',
  CamYawLeft: 'Carte : lacet gauche', CamYawRight: 'Carte : lacet droite', CamTranslateYAxis: 'Carte : avancer / reculer (axe)',
  CamTranslateForward: 'Carte : avancer', CamTranslateBackward: 'Carte : reculer', CamTranslateXAxis: 'Carte : gauche / droite (axe)',
  CamTranslateLeft: 'Carte : gauche', CamTranslateRight: 'Carte : droite', CamTranslateZAxis: 'Carte : monter / descendre (axe)',
  CamTranslateUp: 'Carte : monter', CamTranslateDown: 'Carte : descendre', CamZoomAxis: 'Carte : zoom (axe)', CamZoomIn: 'Carte : zoom avant',
  CamZoomOut: 'Carte : zoom arrière', CamTranslateZHold: 'Carte : maintien vertical', GalaxyMapHome: 'Carte : revenir à ma position',
  // VRS
  ToggleDriveAssist: 'Assistance de conduite', DriveAssistDefault: 'Assistance de conduite par défaut', MouseBuggySteeringXMode: 'VRS souris : direction',
  MouseBuggySteeringXDecay: 'VRS souris : retour au centre de la direction', MouseBuggyRollingXMode: 'VRS souris : roulis',
  MouseBuggyRollingXDecay: 'VRS souris : retour au centre du roulis', MouseBuggyYMode: 'VRS souris : axe Y', MouseBuggyYDecay: 'VRS souris : retour au centre de l’axe Y',
  SteeringAxis: 'VRS : direction (axe)', SteerLeftButton: 'VRS : tourner à gauche', SteerRightButton: 'VRS : tourner à droite',
  BuggyRollAxisRaw: 'VRS : roulis (axe)', BuggyRollLeftButton: 'VRS : roulis à gauche', BuggyRollRightButton: 'VRS : roulis à droite',
  BuggyPitchAxis: 'VRS : tangage (axe)', BuggyPitchUpButton: 'VRS : tangage haut', BuggyPitchDownButton: 'VRS : tangage bas',
  VerticalThrustersButton: 'VRS : propulseurs verticaux', BuggyPrimaryFireButton: 'VRS : tir principal', BuggySecondaryFireButton: 'VRS : tir secondaire',
  AutoBreakBuggyButton: 'VRS : frein à main', HeadlightsBuggyButton: 'VRS : phares', ToggleBuggyTurretButton: 'VRS : mode tourelle',
  BuggyCycleFireGroupNext: 'VRS : groupe de tir suivant', BuggyCycleFireGroupPrevious: 'VRS : groupe de tir précédent', SelectTarget_Buggy: 'VRS : cibler devant',
  MouseTurretXMode: 'Tourelle souris : axe X', MouseTurretXDecay: 'Tourelle souris : retour au centre X', MouseTurretYMode: 'Tourelle souris : axe Y',
  MouseTurretYDecay: 'Tourelle souris : retour au centre Y', BuggyTurretYawAxisRaw: 'Tourelle : lacet (axe)', BuggyTurretYawLeftButton: 'Tourelle : gauche',
  BuggyTurretYawRightButton: 'Tourelle : droite', BuggyTurretPitchAxisRaw: 'Tourelle : tangage (axe)', BuggyTurretPitchUpButton: 'Tourelle : haut',
  BuggyTurretPitchDownButton: 'Tourelle : bas', BuggyTurretMouseSensitivity: 'Tourelle : sensibilité de la souris',
  BuggyTurretMouseDeadzone: 'Tourelle : zone morte de la souris', BuggyTurretMouseLinearity: 'Tourelle : linéarité de la souris',
  DriveSpeedAxis: 'VRS : vitesse (axe)', BuggyThrottleRange: 'VRS : plage de l’accélérateur', BuggyToggleReverseThrottleInput: 'VRS : marche arrière',
  BuggyThrottleIncrement: 'VRS : pas de l’accélérateur', IncreaseSpeedButtonMax: 'VRS : vitesse maximale', DecreaseSpeedButtonMax: 'VRS : vitesse nulle',
  IncreaseSpeedButtonPartial: 'VRS : accélérer', DecreaseSpeedButtonPartial: 'VRS : ralentir', IncreaseEnginesPower_Buggy: 'VRS : énergie aux moteurs (MOT)',
  IncreaseWeaponsPower_Buggy: 'VRS : énergie aux armes (ARM)', IncreaseSystemsPower_Buggy: 'VRS : énergie aux systèmes (SYS)',
  ResetPowerDistribution_Buggy: 'VRS : équilibrer l’énergie (RAZ)', ToggleCargoScoop_Buggy: 'VRS : écope de cargaison', EjectAllCargo_Buggy: 'VRS : larguer toute la cargaison',
  RecallDismissShip: 'Rappeler / renvoyer le vaisseau', EnableMenuGroupsSRV: 'VRS : groupes de menus', UIFocus_Buggy: 'VRS : focus interface',
  FocusLeftPanel_Buggy: 'VRS : panneau de navigation', FocusCommsPanel_Buggy: 'VRS : panneau de communication', QuickCommsPanel_Buggy: 'VRS : communications rapides',
  FocusRadarPanel_Buggy: 'VRS : panneau de rôle', FocusRightPanel_Buggy: 'VRS : panneau des systèmes', GalaxyMapOpen_Buggy: 'VRS : carte de la galaxie',
  SystemMapOpen_Buggy: 'VRS : carte du système', OpenCodexGoToDiscovery_Buggy: 'VRS : codex', PlayerHUDModeToggle_Buggy: 'VRS : mode du HUD',
  HeadLookToggle_Buggy: 'VRS : vue libre',
  // Équipage multiple
  MultiCrewToggleMode: 'Équipage : changer de mode', MultiCrewPrimaryFire: 'Équipage : tir principal', MultiCrewSecondaryFire: 'Équipage : tir secondaire',
  MultiCrewPrimaryUtilityFire: 'Équipage : utilitaire principal', MultiCrewSecondaryUtilityFire: 'Équipage : utilitaire secondaire',
  MultiCrewThirdPersonMouseXMode: 'Équipage souris : axe X', MultiCrewThirdPersonMouseXDecay: 'Équipage souris : retour au centre X',
  MultiCrewThirdPersonMouseYMode: 'Équipage souris : axe Y', MultiCrewThirdPersonMouseYDecay: 'Équipage souris : retour au centre Y',
  MultiCrewThirdPersonYawAxisRaw: 'Équipage : lacet (axe)', MultiCrewThirdPersonYawLeftButton: 'Équipage : lacet gauche',
  MultiCrewThirdPersonYawRightButton: 'Équipage : lacet droite', MultiCrewThirdPersonPitchAxisRaw: 'Équipage : tangage (axe)',
  MultiCrewThirdPersonPitchUpButton: 'Équipage : tangage haut', MultiCrewThirdPersonPitchDownButton: 'Équipage : tangage bas',
  MultiCrewThirdPersonMouseSensitivity: 'Équipage : sensibilité de la souris', MultiCrewThirdPersonFovAxisRaw: 'Équipage : champ de vision (axe)',
  MultiCrewThirdPersonFovOutButton: 'Équipage : champ de vision plus large', MultiCrewThirdPersonFovInButton: 'Équipage : champ de vision plus étroit',
  MultiCrewCockpitUICycleForward: 'Équipage : interface suivante', MultiCrewCockpitUICycleBackward: 'Équipage : interface précédente',
  // Chasseur
  OrderRequestDock: 'Chasseur : rentrer au vaisseau', OrderDefensiveBehaviour: 'Chasseur : défensif', OrderAggressiveBehaviour: 'Chasseur : agressif',
  OrderFocusTarget: 'Chasseur : attaquer ma cible', OrderHoldFire: 'Chasseur : cesser le feu', OrderHoldPosition: 'Chasseur : tenir la position',
  OrderFollow: 'Chasseur : me suivre', OpenOrders: 'Ordres à l’équipage',
  // Caméras
  PhotoCameraToggle: 'Caméra externe', PhotoCameraToggle_Buggy: 'VRS : caméra externe', PhotoCameraToggle_Humanoid: 'À pied : caméra externe',
  VanityCameraScrollLeft: 'Caméra précédente', VanityCameraScrollRight: 'Caméra suivante', ToggleFreeCam: 'Caméra libre',
  VanityCameraOne: 'Caméra 1 : cockpit avant', VanityCameraTwo: 'Caméra 2 : cockpit arrière', VanityCameraThree: 'Caméra 3 : commandant 1',
  VanityCameraFour: 'Caméra 4 : commandant 2', VanityCameraFive: 'Caméra 5 : copilote 1', VanityCameraSix: 'Caméra 6 : copilote 2',
  VanityCameraSeven: 'Caméra 7 : avant', VanityCameraEight: 'Caméra 8 : arrière', VanityCameraNine: 'Caméra 9 : basse', VanityCameraTen: 'Caméra 10',
  FreeCamToggleHUD: 'Caméra libre : HUD', FreeCamSpeedInc: 'Caméra libre : plus vite', FreeCamSpeedDec: 'Caméra libre : moins vite',
  MoveFreeCamY: 'Caméra libre : avancer / reculer (axe)', ThrottleRangeFreeCam: 'Caméra libre : plage des gaz', ToggleReverseThrottleInputFreeCam: 'Caméra libre : inverser',
  MoveFreeCamForward: 'Caméra libre : avancer', MoveFreeCamBackwards: 'Caméra libre : reculer', MoveFreeCamX: 'Caméra libre : gauche / droite (axe)',
  MoveFreeCamRight: 'Caméra libre : droite', MoveFreeCamLeft: 'Caméra libre : gauche', MoveFreeCamZ: 'Caméra libre : monter / descendre (axe)',
  MoveFreeCamUpAxis: 'Caméra libre : monter (axe)', MoveFreeCamDownAxis: 'Caméra libre : descendre (axe)', MoveFreeCamUp: 'Caméra libre : monter',
  MoveFreeCamDown: 'Caméra libre : descendre', PitchCameraMouse: 'Caméra libre : tangage à la souris', YawCameraMouse: 'Caméra libre : lacet à la souris',
  PitchCamera: 'Caméra libre : tangage (axe)', FreeCamMouseSensitivity: 'Caméra libre : sensibilité de la souris', FreeCamMouseYDecay: 'Caméra libre : retour au centre Y',
  PitchCameraUp: 'Caméra libre : tangage haut', PitchCameraDown: 'Caméra libre : tangage bas', YawCamera: 'Caméra libre : lacet (axe)',
  FreeCamMouseXDecay: 'Caméra libre : retour au centre X', YawCameraLeft: 'Caméra libre : lacet gauche', YawCameraRight: 'Caméra libre : lacet droite',
  RollCamera: 'Caméra libre : roulis (axe)', RollCameraLeft: 'Caméra libre : roulis gauche', RollCameraRight: 'Caméra libre : roulis droite',
  ToggleRotationLock: 'Caméra libre : bloquer la rotation', FixCameraRelativeToggle: 'Caméra : fixée au véhicule', FixCameraWorldToggle: 'Caméra : fixée au monde',
  QuitCamera: 'Quitter la caméra libre', ToggleAdvanceMode: 'Caméra avancée', FreeCamZoomIn: 'Caméra libre : zoom avant', FreeCamZoomOut: 'Caméra libre : zoom arrière',
  FStopDec: 'Caméra : moins de flou', FStopInc: 'Caméra : plus de flou',
  // Holo-Me, GalNet
  CommanderCreator_Undo: 'Holo-Me : annuler', CommanderCreator_Redo: 'Holo-Me : rétablir', CommanderCreator_Rotation_MouseToggle: 'Holo-Me : rotation à la souris',
  CommanderCreator_Rotation: 'Holo-Me : rotation (axe)', GalnetAudio_Play_Pause: 'GalNet audio : lecture / pause', GalnetAudio_SkipForward: 'GalNet audio : piste suivante',
  GalnetAudio_SkipBackward: 'GalNet audio : piste précédente', GalnetAudio_ClearQueue: 'GalNet audio : vider la file',
  // FSS
  ExplorationFSSCameraPitch: 'FSS : tangage (axe)', ExplorationFSSCameraPitchIncreaseButton: 'FSS : tangage haut',
  ExplorationFSSCameraPitchDecreaseButton: 'FSS : tangage bas', ExplorationFSSCameraYaw: 'FSS : lacet (axe)',
  ExplorationFSSCameraYawIncreaseButton: 'FSS : lacet droite', ExplorationFSSCameraYawDecreaseButton: 'FSS : lacet gauche', ExplorationFSSZoomIn: 'FSS : zoom avant',
  ExplorationFSSZoomOut: 'FSS : zoom arrière', ExplorationFSSMiniZoomIn: 'FSS : petit zoom avant', ExplorationFSSMiniZoomOut: 'FSS : petit zoom arrière',
  ExplorationFSSRadioTuningX_Raw: 'FSS : réglage de fréquence (axe)', ExplorationFSSRadioTuningX_Increase: 'FSS : fréquence vers la droite',
  ExplorationFSSRadioTuningX_Decrease: 'FSS : fréquence vers la gauche', ExplorationFSSRadioTuningAbsoluteX: 'FSS : réglage de fréquence absolu (axe)',
  FSSTuningSensitivity: 'FSS : sensibilité du réglage', ExplorationFSSDiscoveryScan: 'FSS : balayage de découverte (klaxon)', ExplorationFSSQuit: 'Quitter le FSS',
  FSSMouseXMode: 'FSS souris : axe X', FSSMouseXDecay: 'FSS souris : retour au centre X', FSSMouseYMode: 'FSS souris : axe Y', FSSMouseYDecay: 'FSS souris : retour au centre Y',
  FSSMouseSensitivity: 'FSS : sensibilité de la souris', FSSMouseDeadzone: 'FSS : zone morte de la souris', FSSMouseLinearity: 'FSS : linéarité de la souris',
  ExplorationFSSTarget: 'FSS : cibler', ExplorationFSSShowHelp: 'FSS : aide',
  // DSS
  ExplorationSAAChangeScannedAreaViewToggle: 'DSS : face avant / arrière de la planète', ExplorationSAAExitThirdPerson: 'Quitter le DSS',
  ExplorationSAANextGenus: 'DSS : genre biologique suivant', ExplorationSAAPreviousGenus: 'DSS : genre biologique précédent',
  SAAThirdPersonMouseXMode: 'DSS souris : axe X', SAAThirdPersonMouseXDecay: 'DSS souris : retour au centre X', SAAThirdPersonMouseYMode: 'DSS souris : axe Y',
  SAAThirdPersonMouseYDecay: 'DSS souris : retour au centre Y', SAAThirdPersonMouseSensitivity: 'DSS : sensibilité de la souris',
  SAAThirdPersonYawAxisRaw: 'DSS : lacet (axe)', SAAThirdPersonYawLeftButton: 'DSS : lacet gauche', SAAThirdPersonYawRightButton: 'DSS : lacet droite',
  SAAThirdPersonPitchAxisRaw: 'DSS : tangage (axe)', SAAThirdPersonPitchUpButton: 'DSS : tangage haut', SAAThirdPersonPitchDownButton: 'DSS : tangage bas',
  SAAThirdPersonFovAxisRaw: 'DSS : champ de vision (axe)', SAAThirdPersonFovOutButton: 'DSS : champ de vision plus large', SAAThirdPersonFovInButton: 'DSS : champ de vision plus étroit',
  // À pied
  MouseHumanoidXMode: 'À pied souris : axe X', MouseHumanoidYMode: 'À pied souris : axe Y', MouseHumanoidSensitivity: 'À pied : sensibilité de la souris',
  HumanoidForwardAxis: 'À pied : avancer / reculer (axe)', HumanoidForwardButton: 'À pied : avancer', HumanoidBackwardButton: 'À pied : reculer',
  HumanoidStrafeAxis: 'À pied : pas de côté (axe)', HumanoidStrafeLeftButton: 'À pied : pas à gauche', HumanoidStrafeRightButton: 'À pied : pas à droite',
  HumanoidRotateAxis: 'À pied : tourner (axe)', HumanoidRotateSensitivity: 'À pied : sensibilité de rotation', HumanoidRotateLeftButton: 'À pied : tourner à gauche',
  HumanoidRotateRightButton: 'À pied : tourner à droite', HumanoidPitchAxis: 'À pied : regarder haut / bas (axe)', HumanoidPitchSensitivity: 'À pied : sensibilité verticale',
  HumanoidPitchUpButton: 'À pied : regarder en haut', HumanoidPitchDownButton: 'À pied : regarder en bas', HumanoidSprintButton: 'À pied : sprint',
  HumanoidWalkButton: 'À pied : marcher', HumanoidCrouchButton: 'À pied : s’accroupir', HumanoidJumpButton: 'À pied : sauter',
  HumanoidPrimaryInteractButton: 'À pied : interagir', HumanoidSecondaryInteractButton: 'À pied : interaction secondaire', HumanoidItemWheelButton: 'À pied : roue des objets',
  HumanoidEmoteWheelButton: 'À pied : roue des émotes', HumanoidUtilityWheelCycleMode: 'À pied : mode de la roue utilitaire',
  HumanoidItemWheelButton_XAxis: 'Roue des objets : gauche / droite (axe)', HumanoidItemWheelButton_XLeft: 'Roue des objets : gauche',
  HumanoidItemWheelButton_XRight: 'Roue des objets : droite', HumanoidItemWheelButton_YAxis: 'Roue des objets : haut / bas (axe)',
  HumanoidItemWheelButton_YUp: 'Roue des objets : haut', HumanoidItemWheelButton_YDown: 'Roue des objets : bas', HumanoidItemWheel_AcceptMouseInput: 'Roue des objets à la souris',
  HumanoidPrimaryFireButton: 'À pied : tirer', HumanoidZoomButton: 'À pied : viser (zoom)', HumanoidThrowGrenadeButton: 'À pied : lancer une grenade',
  HumanoidMeleeButton: 'À pied : corps à corps', HumanoidReloadButton: 'À pied : recharger', HumanoidSwitchWeapon: 'À pied : changer d’arme',
  HumanoidSelectPrimaryWeaponButton: 'À pied : arme principale', HumanoidSelectSecondaryWeaponButton: 'À pied : arme secondaire',
  HumanoidSelectUtilityWeaponButton: 'À pied : arme utilitaire', HumanoidSelectNextWeaponButton: 'À pied : arme suivante',
  HumanoidSelectPreviousWeaponButton: 'À pied : arme précédente', HumanoidHideWeaponButton: 'À pied : ranger l’arme',
  HumanoidSelectNextGrenadeTypeButton: 'À pied : grenade suivante', HumanoidSelectPreviousGrenadeTypeButton: 'À pied : grenade précédente',
  HumanoidToggleFlashlightButton: 'À pied : lampe torche', HumanoidToggleNightVisionButton: 'À pied : vision nocturne', HumanoidToggleShieldsButton: 'À pied : boucliers',
  HumanoidClearAuthorityLevel: 'À pied : effacer le niveau d’autorité', HumanoidHealthPack: 'À pied : trousse de soins', HumanoidBattery: 'À pied : cellule d’énergie',
  HumanoidSelectFragGrenade: 'À pied : grenade à fragmentation', HumanoidSelectEMPGrenade: 'À pied : grenade IEM', HumanoidSelectShieldGrenade: 'À pied : grenade bouclier',
  HumanoidSwitchToRechargeTool: 'À pied : outil de recharge (Arc Cutter…)', HumanoidSwitchToCompAnalyser: 'À pied : analyseur de composition',
  HumanoidSwitchToSuitTool: 'À pied : outil de la combinaison', HumanoidToggleToolModeButton: 'À pied : mode de l’outil',
  HumanoidToggleMissionHelpPanelButton: 'À pied : aide de mission', HumanoidPing: 'À pied : signaler (ping)', GalaxyMapOpen_Humanoid: 'À pied : carte de la galaxie',
  SystemMapOpen_Humanoid: 'À pied : carte du système', FocusCommsPanel_Humanoid: 'À pied : panneau de communication', QuickCommsPanel_Humanoid: 'À pied : communications rapides',
  HumanoidOpenAccessPanelButton: 'À pied : ouvrir le panneau d’accès', HumanoidConflictContextualUIButton: 'À pied : interface de combat',
  EnableMenuGroupsOnFoot: 'À pied : groupes de menus', EnableAimAssistOnFoot: 'À pied : aide à la visée',
  // Boutique
  StoreEnableRotation: 'Boutique : rotation de l’aperçu', StorePitchCamera: 'Boutique : tangage de l’aperçu (axe)', StoreYawCamera: 'Boutique : lacet de l’aperçu (axe)',
  StoreCamZoomIn: 'Boutique : zoom avant', StoreCamZoomOut: 'Boutique : zoom arrière', StoreToggle: 'Boutique : basculer l’aperçu',
  // Émotes
  HumanoidEmoteSlot1: 'Émote 1', HumanoidEmoteSlot2: 'Émote 2', HumanoidEmoteSlot3: 'Émote 3', HumanoidEmoteSlot4: 'Émote 4',
  HumanoidEmoteSlot5: 'Émote 5', HumanoidEmoteSlot6: 'Émote 6', HumanoidEmoteSlot7: 'Émote 7', HumanoidEmoteSlot8: 'Émote 8',
  // Colonisation
  PlaceSettlement: 'Colonisation : placer', ChangeConstructionOption: 'Colonisation : changer de construction', RotateSettlement: 'Colonisation : tourner (axe)',
  RotateSettlementLeft: 'Colonisation : tourner à gauche', RotateSettlementRight: 'Colonisation : tourner à droite', ExitSettlementPlacementCamera: 'Colonisation : quitter le placement',
  MovePlacementCamY: 'Placement : avancer / reculer (axe)', MovePlacementCamForward: 'Placement : avancer', MovePlacementCamBackwards: 'Placement : reculer',
  MovePlacementCamX: 'Placement : gauche / droite (axe)', MovePlacementCamRight: 'Placement : droite', MovePlacementCamLeft: 'Placement : gauche',
  MovePlacementCamZ: 'Placement : monter / descendre (axe)', MovePlacementCamUp: 'Placement : monter', MovePlacementCamDown: 'Placement : descendre',
  MovePlacementCamUpAxis: 'Placement : monter (axe)', MovePlacementCamDownAxis: 'Placement : descendre (axe)', PitchPlacementCamera: 'Placement : tangage (axe)',
  PitchPlacementCameraUp: 'Placement : tangage haut', PitchPlacementCameraDown: 'Placement : tangage bas', YawPlacementCamera: 'Placement : lacet (axe)',
  YawPlacementCameraRight: 'Placement : lacet droite', YawPlacementCameraLeft: 'Placement : lacet gauche', PlacementCamSpeedInc: 'Placement : plus vite',
  PlacementCamSpeedDec: 'Placement : moins vite', PlacementCamMouseSensitivity: 'Placement : sensibilité de la souris',
  PlacementCamMouseXDecay: 'Placement : retour au centre X', PlacementCamMouseYDecay: 'Placement : retour au centre Y',
  // Réglage général
  KeyboardLayout: 'Disposition du clavier',
};

// Intention par commande : d'abord ces règles (nom de balise), sinon d'après la section
const REGLES = [
  [/^(Hyperspace|Supercruise|HyperSuperCombination|TargetNextRouteSystem|GalaxyMapOpen|SystemMapOpen|GalaxyMapHome|Cam(Pitch|Yaw|Translate|Zoom))/, 'voyager'],
  [/^(LandingGearToggle|.*_Landing)$/, 'atterrir'],
  [/^(UseShieldCell|FireChaffLauncher|ChargeECM|DeployHeatSink|ToggleButtonUpInput|Increase(Engines|Weapons|Systems)Power$|ResetPowerDistribution$|TriggerFieldNeutraliser)/, 'combattre'],
  [/^(ToggleCargoScoop|EjectAllCargo)$/, 'soute'],
  [/^(Exploration|SAA|FSS|OpenCodexGoToDiscovery)/, 'explorer'],
  [/^(UI_|CycleNext(Panel|Page)|CyclePrevious(Panel|Page)|UIFocus$|UIFocusMode|Focus\w*Panel$|QuickCommsPanel$|\w+PanelFocusOptions|FocusOnTextEntryField|PlayerHUDModeToggle$|Pause|FriendsMenu)/, 'interface'],
  [/(_Buggy$|^Buggy|^MouseBuggy|^MouseTurret|^Steer|^DriveSpeed|^DriveAssist|^ToggleDriveAssist|SpeedButton|^VerticalThrustersButton|^AutoBreak|^HeadlightsBuggy|^ToggleBuggyTurret|^RecallDismissShip|^EnableMenuGroupsSRV)/, 'vrs'],
  [/(^Humanoid|_Humanoid$|^MouseHumanoid|OnFoot$)/, 'a-pied'],
  [/^(MultiCrew|Order|OpenOrders)/, 'equipage'],
  [/^(PhotoCamera|VanityCamera|FreeCam|MoveFreeCam|ToggleFreeCam|PitchCamera|YawCamera|RollCamera|ToggleRotationLock|FixCamera|QuitCamera|ToggleAdvanceMode|FStop|FocusDistance|ThrottleRangeFreeCam|ToggleReverseThrottleInputFreeCam|Store)/, 'camera'],
  [/(Settlement|Placement|TriggerColonisationModule)/, 'colonisation'],
  [/^(Yaw|Roll|Pitch|LateralThrust|VerticalThrust|AheadThrust|ForwardThrust|BackwardThrust|LeftThrust|RightThrust|UpThrust|DownThrust|Throttle|ToggleReverseThrottleInput|ForwardKey|BackwardKey|SetSpeed|UseAlternateFlightValuesToggle|ToggleFlightAssist|UseBoostJuice|DisableRotationCorrectToggle|MouseReset|BlockMouseDecay)/, 'piloter'],
  [/^(SelectTarget|Cycle\w*Target|SelectHighestThreat|TargetWingman|WingNavLock|Cycle\w*Subsystem|PrimaryFire|SecondaryFire|CycleFireGroup|DeployHardpoint)/, 'combattre'],
  [/^(HeadLook|Headlook)/, 'camera'],
];

/** Intention d'une commande (« reglages » pour un réglage, sans touche). */
export function intentionDe(id, genre) {
  if (genre === 'reglage') return 'reglages';
  for (const [re, intention] of REGLES) if (re.test(id)) return intention;
  return 'divers';
}

/** Nom lisible d'une balise inconnue du catalogue : « HumanoidNewThing » → « Humanoid new thing ». */
export function nomParDefaut(id) {
  const mots = String(id).replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return mots ? mots[0].toUpperCase() + mots.slice(1) : String(id);
}

/** Section du menu de chaque entrée, d'après l'ordre du fichier du joueur : Map id → { section, sous }. */
export function sectionsDe(ids) {
  const debuts = new Map(SECTIONS.map(([id, section, sous]) => [id, { section, sous }]));
  const out = new Map();
  let courante = null;
  for (const id of ids) {
    courante = debuts.get(id) || courante;
    out.set(id, courante || { section: 'Commandes générales', sous: null });
  }
  return out;
}
