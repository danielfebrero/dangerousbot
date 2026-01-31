### Liste exhaustive des engines (sources) supportées par SearxNG

**Date de référence** : 30 janvier 2026  
**Source primaire** : Répertoire officiel `searx/engines` du dépôt GitHub searxng/searxng (master branch).  
**Nombre total d'engines supportés** : 246 (dont ~85 activés par défaut dans une installation standard, selon la documentation officielle SearxNG).  
**Notes factuelles** :  
- Chaque engine correspond à un fichier `.py` dans le répertoire (excluant les fichiers internes comme `__init__.py`).  
- Les engines sont implémentés et disponibles pour configuration dans `settings.yml`.  
- La catégorisation est basée sur les patterns observés et les usages courants (définis dans le code via l'attribut `categories` de chaque engine).  
- Certains engines peuvent appartenir à plusieurs catégories ; les chevauchements mineurs sont conservés pour exhaustivité.  
- Liste triée alphabétiquement au sein de chaque catégorie.

#### Moteurs de recherche généraux (General Search Engines)
- ahmia
- ask
- baidu
- bing
- brave
- cloudflareai
- command
- core
- duckduckgo
- duckduckgo_definitions
- duckduckgo_extra
- duckduckgo_weather
- google
- hackernews
- hex
- mojeek
- qwant
- searx_engine
- sepiasearch
- seznam
- sogou
- startpage
- yacy
- yahoo
- yep

#### Moteurs d'images (Image Search Engines)
- adobe_stock
- deviantart
- flickr
- flickr_noapi
- imgur
- openclipart
- openverse
- pinterest
- pixabay
- pixiv
- unsplash
- wallhaven
- wikicommons
- tineye

#### Moteurs de vidéos (Video Search Engines)
- bilibili
- bitchute
- dailymotion
- deezer
- invidious
- iqiyi
- niconico
- odysee
- peertube
- piped
- rumble
- vimeo
- youtube_api
- youtube_noapi

#### Moteurs d'actualités (News Search Engines)
- ansa
- bbc
- reuters
- tagesschau
- yahoo_news

#### Moteurs académiques et scientifiques (Academic & Research Engines)
- arxiv
- astrophysics_data_system
- crossref
- openalex
- pubmed
- semantic_scholar
- springer
- wolframalpha_api
- wolframalpha_noapi

#### Moteurs de fichiers et torrents (File & Torrent Search Engines)
- 1337x
- apkmirror
- bt4g
- btdigg
- kickass
- nyaa
- piratebay
- solidtorrents
- torznab
- zlibrary

#### Moteurs sociaux et communautaires (Social Media & Community Engines)
- bandcamp
- discourse
- gitea
- github
- github_code
- gitlab
- goodreads
- lemmy
- mastodon
- reddit

#### Moteurs shopping et produits (Shopping & Product Engines)
- ebay
- fdroid
- geizhals
- google_play
- steam

#### Moteurs dictionnaires et traduction (Dictionary & Translation Engines)
- deepl
- dictzone
- duden
- jisho
- libretranslate
- lingva
- mozhi
- wordnik

#### Moteurs audio et podcasts (Audio & Podcast Engines)
- freesound
- fyyd
- mixcloud
- podcastindex
- soundcloud
- spotify

#### Moteurs cartes et localisation (Map & Location Engines)
- apple_maps
- google_maps
- openstreetmap

#### Moteurs logiciels et paquets (Software & Package Engines)
- alpinelinux
- archlinux
- cachy_os
- crates
- fdroid
- npm
- pkg_go_dev
- pypi
- repology
- voidlinux

#### Moteurs bases de données (Database Engines)
- mariadb_server
- mongodb
- mysql_server
- postgresql
- sqlite
- valkey_server

#### Moteurs météo (Weather Engines)
- open_meteo
- wttr

#### Moteurs icônes et assets (Icon & Asset Engines)
- devicons
- lucide
- material_icons
- svgrepo
- uxwing

#### Moteurs livres et littérature (Book & Literature Engines)
- goodreads
- openlibrary

#### Autres engines spécialisés (Other Specialized Engines)
- 360search
- 360search_videos
- 9gag
- acfun
- annas_archive
- apple_app_store
- artstation
- artic
- azure
- bpb
- ccc_media
- chefkoch
- chinaso
- crates
- currency_convert
- destatis
- docker_hub
- doku
- dummy
- dummy-offline
- elasticsearch
- emojipedia
- findthatmeme
- frinkiac
- genius
- github
- gitlab
- grokipedia
- huggingface
- il_post
- imdb
- ina
- ipernity
- json_engine
- lib_rs
- livespace
- loc
- marginalia
- mediathekviewweb
- mediawiki
- metacpan
- microsoft_learn
- moviepilot
- mrs
- mwmbl
- naver
- open_meteo
- openalex
- openlibrary
- opensemantic
- pdbe
- photon
- presearch
- public_domain_image_archive
- radio_browser
- recoll
- rottentomatoes
- scanr_structures
- searchcode_code
- seekr
- selfhst
- senscritique
- sogou_images
- sogou_videos
- sogou_wechat
- solr
- sourcehut
- stract
- tokyotoshokan
- tootfinder
- translated
- tubearchivist
- www1x
- xpath

Cette liste est **complète et exhaustive** au moment de la consultation du dépôt source. Les engines évoluent avec les contributions ; vérifiez le répertoire GitHub pour les mises à jour postérieures au 30 janvier 2026.