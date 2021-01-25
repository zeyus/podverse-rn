import debounce from 'lodash/debounce'
import { convertNowPlayingItemToEpisode, convertToNowPlayingItem } from 'podverse-shared'
import { Alert } from 'react-native'
import Dialog from 'react-native-dialog'
import React from 'reactn'
import {
  ActionSheet,
  ActivityIndicator,
  ClipTableCell,
  Divider,
  FlatList,
  SearchBar,
  SwipeRowBack,
  TableSectionSelectors,
  View
} from '../components'
import { getDownloadedEpisodeIds } from '../lib/downloadedPodcast'
import { downloadEpisode } from '../lib/downloader'
import { getSelectedFilterLabel } from '../lib/filters'
import { translate } from '../lib/i18n'
import { hasValidNetworkConnection } from '../lib/network'
import { isOdd, safelyUnwrapNestedVariable, setCategoryQueryProperty, testProps } from '../lib/utility'
import { PV } from '../resources'
import { assignCategoryQueryToState, assignCategoryToStateForSortSelect } from '../services/category'
import { deleteMediaRef, getMediaRefs } from '../services/mediaRef'
import { trackPageView } from '../services/tracking'
import { getLoggedInUserMediaRefs } from '../services/user'
import { loadItemAndPlayTrack } from '../state/actions/player'
import { core } from '../styles'

type Props = {
  navigation?: any
}

type State = {
  endOfResultsReached: boolean
  flatListData: any[]
  flatListDataTotalCount: number | null
  isLoading: boolean
  isLoadingMore: boolean
  isRefreshing: boolean
  mediaRefIdToDelete?: string
  queryFrom: string | null
  queryPage: number
  querySort: string | null
  searchBarText: string
  selectedCategory: string | null
  selectedCategorySub: string | null
  selectedFilterLabel?: string | null
  selectedItem?: any
  showActionSheet: boolean
  showDeleteConfirmDialog?: boolean
  showNoInternetConnectionMessage?: boolean
}

const testIDPrefix = 'clips_screen'

export class ClipsScreen extends React.Component<Props, State> {
  static navigationOptions = () => {
    return {
      title: translate('Clips')
    }
  }

  constructor(props: Props) {
    super(props)

    const { subscribedPodcastIds } = this.global.session.userInfo

    this.state = {
      endOfResultsReached: false,
      flatListData: [],
      flatListDataTotalCount: null,
      isLoading: true,
      isLoadingMore: false,
      isRefreshing: false,
      queryFrom:
        subscribedPodcastIds && subscribedPodcastIds.length > 0
          ? PV.Filters._subscribedKey
          : PV.Filters._allPodcastsKey,
      queryPage: 1,
      querySort:
        subscribedPodcastIds && subscribedPodcastIds.length > 0 ? PV.Filters._mostRecentKey : PV.Filters._topPastWeek,
      searchBarText: '',
      selectedCategory: null,
      selectedCategorySub: null,
      selectedFilterLabel: translate('Subscribed'),
      showActionSheet: false
    }

    this._handleSearchBarTextQuery = debounce(this._handleSearchBarTextQuery, PV.SearchBar.textInputDebounceTime)
  }

  async componentDidMount() {
    const { queryFrom } = this.state
    const newState = await this._queryData(queryFrom)
    this.setState(newState)
    trackPageView('/clips', 'Clips Screen')
  }

  handleSelectFilterItem = async (selectedKey: string) => {
    if (!selectedKey) {
      return
    }

    const { querySort } = this.state

    this.setState(
      {
        endOfResultsReached: false,
        flatListData: [],
        flatListDataTotalCount: null,
        isLoading: true,
        queryFrom: selectedKey,
        queryPage: 1,
        querySort,
        searchBarText: ''
      },
      async () => {
        const newState = await this._queryData(selectedKey)
        this.setState(newState)
      }
    )
  }

  handleSelectSortItem = async (selectedKey: string) => {
    if (!selectedKey) {
      return
    }

    this.setState(
      {
        endOfResultsReached: false,
        flatListData: [],
        flatListDataTotalCount: null,
        isLoading: true,
        queryPage: 1,
        querySort: selectedKey
      },
      async () => {
        const newState = await this._queryData(selectedKey)
        this.setState(newState)
      }
    )
  }

  _selectCategory = async (selectedKey: string, isSubCategory?: boolean) => {
    if (!selectedKey) {
      return
    }

    this.setState(
      {
        endOfResultsReached: false,
        isLoading: true,
        ...((isSubCategory ? { selectedCategorySub: selectedKey } : { selectedCategory: selectedKey }) as any),
        flatListData: [],
        flatListDataTotalCount: null,
        queryPage: 1
      },
      async () => {
        const newState = await this._queryData(selectedKey, { isSubCategory })
        this.setState(newState)
      }
    )
  }

  _onEndReached = ({ distanceFromEnd }) => {
    const { endOfResultsReached, isLoadingMore, queryFrom, queryPage = 1 } = this.state
    if (!endOfResultsReached && !isLoadingMore) {
      if (distanceFromEnd > -1) {
        this.setState(
          {
            isLoadingMore: true,
            queryPage: queryPage + 1
          },
          async () => {
            const newState = await this._queryData(queryFrom, {
              queryPage: this.state.queryPage,
              searchAllFieldsText: this.state.searchBarText
            })
            this.setState(newState)
          }
        )
      }
    }
  }

  _onRefresh = () => {
    const { queryFrom } = this.state

    this.setState(
      {
        isRefreshing: true
      },
      async () => {
        const newState = await this._queryData(queryFrom, {
          queryPage: 1,
          searchAllFieldsText: this.state.searchBarText
        })
        this.setState(newState)
      }
    )
  }

  _ListHeaderComponent = () => {
    const { searchBarText } = this.state

    return (
      <View style={core.ListHeaderComponent}>
        <SearchBar
          inputContainerStyle={core.searchBar}
          onChangeText={this._handleSearchBarTextChange}
          onClear={this._handleSearchBarClear}
          value={searchBarText}
        />
      </View>
    )
  }

  _ItemSeparatorComponent = () => {
    return <Divider />
  }

  _handleCancelPress = () => {
    return new Promise((resolve, reject) => {
      this.setState({ showActionSheet: false }, resolve)
    })
  }

  _handleMorePress = (selectedItem: any) => {
    this.setState({
      selectedItem,
      showActionSheet: true
    })
  }

  _renderClipItem = ({ item, index }) => {
    const title = item?.title?.trim() || ''
    const episodeTitle = item?.episode?.title?.trim() || ''
    const podcastTitle = item?.episode?.podcast?.title?.trim() || ''

    return item && item.episode && item.episode.id ? (
      <ClipTableCell
        endTime={item.endTime}
        episodeId={item.episode.id}
        {...(item.episode.pubDate ? { episodePubDate: item.episode.pubDate } : {})}
        {...(episodeTitle ? { episodeTitle } : {})}
        handleMorePress={() => this._handleMorePress(convertToNowPlayingItem(item, null, null))}
        handleNavigationPress={() => this._handleNavigationPress(convertToNowPlayingItem(item, null, null))}
        hasZebraStripe={isOdd(index)}
        podcastImageUrl={item.episode.podcast.shrunkImageUrl || item.episode.podcast.imageUrl}
        {...(podcastTitle ? { podcastTitle } : {})}
        showEpisodeInfo={true}
        showPodcastTitle={true}
        startTime={item.startTime}
        testID={`${testIDPrefix}_clip_item_${index}`}
        {...(title ? { title } : {})}
      />
    ) : (
      <></>
    )
  }

  _handleSearchBarClear = (text: string) => {
    this.setState({
      flatListData: [],
      flatListDataTotalCount: null,
      searchBarText: ''
    })
  }

  _handleSearchBarTextChange = (text: string) => {
    const { queryFrom } = this.state

    this.setState(
      {
        isLoadingMore: true,
        searchBarText: text
      },
      async () => {
        this._handleSearchBarTextQuery(queryFrom, {
          searchAllFieldsText: text
        })
      }
    )
  }

  _handleSearchBarTextQuery = async (queryFrom: string | null, queryOptions: any) => {
    this.setState(
      {
        flatListData: [],
        flatListDataTotalCount: null,
        queryPage: 1
      },
      async () => {
        const state = await this._queryData(queryFrom, {
          searchAllFieldsText: queryOptions.searchAllFieldsText
        })
        this.setState(state)
      }
    )
  }

  _handleDownloadPressed = () => {
    if (this.state.selectedItem) {
      const episode = convertNowPlayingItemToEpisode(this.state.selectedItem)
      downloadEpisode(episode, episode.podcast)
    }
  }

  _renderHiddenItem = ({ item, index }, rowMap) => (
    <SwipeRowBack
      onPress={() => this._handleHiddenItemPress(item.id, rowMap)}
      testID={`${testIDPrefix}_clip_item_${index}`}
      text={translate('Delete')}
    />
  )

  _handleHiddenItemPress = (selectedId, rowMap) => {
    this.setState({
      mediaRefIdToDelete: selectedId,
      showDeleteConfirmDialog: true
    })
  }

  _handleSearchNavigation = () => {
    this.props.navigation.navigate(PV.RouteNames.SearchScreen)
  }

  _deleteMediaRef = async () => {
    const { mediaRefIdToDelete } = this.state
    let { flatListData, flatListDataTotalCount } = this.state

    if (mediaRefIdToDelete) {
      this.setState(
        {
          isLoading: true,
          showDeleteConfirmDialog: false
        },
        async () => {
          try {
            await deleteMediaRef(mediaRefIdToDelete)
            flatListData = flatListData.filter((x: any) => x.id !== mediaRefIdToDelete)
            flatListDataTotalCount = flatListData.length
          } catch (error) {
            if (error.response) {
              Alert.alert(
                PV.Alerts.SOMETHING_WENT_WRONG.title,
                PV.Alerts.SOMETHING_WENT_WRONG.message,
                PV.Alerts.BUTTONS.OK
              )
            }
          }
          this.setState({
            flatListData,
            flatListDataTotalCount,
            isLoading: false,
            mediaRefIdToDelete: ''
          })
        }
      )
    }
  }

  _cancelDeleteMediaRef = async () => {
    this.setState({
      mediaRefIdToDelete: '',
      showDeleteConfirmDialog: false
    })
  }

  _handleNavigationPress = (selectedItem: any) => {
    const shouldPlay = true
    loadItemAndPlayTrack(selectedItem, shouldPlay)
  }

  render() {
    const { navigation } = this.props
    const {
      flatListData,
      flatListDataTotalCount,
      isLoading,
      isLoadingMore,
      isRefreshing,
      queryFrom,
      querySort,
      searchBarText,
      selectedCategory,
      selectedCategorySub,
      selectedFilterLabel,
      selectedItem,
      showActionSheet,
      showDeleteConfirmDialog,
      showNoInternetConnectionMessage
    } = this.state
    const { offlineModeEnabled, session } = this.global
    const subscribedPodcastIds = safelyUnwrapNestedVariable(() => session.userInfo.subscribedPodcastIds, '')
    const isLoggedIn = safelyUnwrapNestedVariable(() => session.isLoggedIn, false)

    const noSubscribedPodcasts =
      queryFrom === PV.Filters._subscribedKey &&
      (!subscribedPodcastIds || subscribedPodcastIds.length === 0) &&
      !searchBarText

    const showOfflineMessage = offlineModeEnabled

    return (
      <View style={styles.view} {...testProps(`${testIDPrefix}_view`)}>
        <TableSectionSelectors
          handleSelectCategoryItem={(x: any) => this._selectCategory(x)}
          handleSelectCategorySubItem={(x: any) => this._selectCategory(x, true)}
          handleSelectFilterItem={this.handleSelectFilterItem}
          handleSelectSortItem={this.handleSelectSortItem}
          includePadding={true}
          navigation={navigation}
          screenName='ClipsScreen'
          selectedCategoryItemKey={selectedCategory}
          selectedCategorySubItemKey={selectedCategorySub}
          selectedFilterItemKey={queryFrom}
          selectedFilterLabel={selectedFilterLabel}
          selectedSortItemKey={querySort}
          testID={testIDPrefix}
        />
        {isLoading && <ActivityIndicator fillSpace={true} />}
        {!isLoading && queryFrom && (
          <FlatList
            data={flatListData}
            dataTotalCount={flatListDataTotalCount}
            disableLeftSwipe={true}
            extraData={flatListData}
            handleNoResultsTopAction={this._handleSearchNavigation}
            isLoadingMore={isLoadingMore}
            isRefreshing={isRefreshing}
            ItemSeparatorComponent={this._ItemSeparatorComponent}
            keyExtractor={(item: any) => item.id}
            ListHeaderComponent={this._ListHeaderComponent}
            noResultsTopActionText={noSubscribedPodcasts ? translate('Search') : ''}
            noResultsMessage={
              noSubscribedPodcasts ? translate('You are not subscribed to any podcasts') : translate('No clips found')
            }
            onEndReached={this._onEndReached}
            onRefresh={this._onRefresh}
            renderHiddenItem={this._renderHiddenItem}
            renderItem={this._renderClipItem}
            showNoInternetConnectionMessage={showOfflineMessage || showNoInternetConnectionMessage}
          />
        )}
        <ActionSheet
          handleCancelPress={this._handleCancelPress}
          items={() => {
            if (!selectedItem) return []

            return PV.ActionSheet.media.moreButtons(selectedItem, navigation, {
              handleDismiss: this._handleCancelPress,
              handleDownload: this._handleDownloadPressed,
              handleDeleteClip: this._handleHiddenItemPress,
              includeGoToEpisode: true
            })
          }}
          showModal={showActionSheet}
          testID={testIDPrefix}
        />
        <Dialog.Container visible={showDeleteConfirmDialog}>
          <Dialog.Title>{translate('Delete Clip')}</Dialog.Title>
          <Dialog.Description>{translate('Are you sure')}</Dialog.Description>
          <Dialog.Button
            label={translate('Cancel')}
            onPress={this._cancelDeleteMediaRef}
            {...testProps(`${testIDPrefix}_delete_clip_cancel`)}
          />
          <Dialog.Button
            label={translate('Delete')}
            onPress={this._deleteMediaRef}
            {...testProps(`${testIDPrefix}_delete_clip_delete`)}
          />
        </Dialog.Container>
      </View>
    )
  }

  _getLoggedInUserMediaRefs = async (queryPage?: number, newSortFilter?: string) => {
    return getLoggedInUserMediaRefs({
      sort: newSortFilter ? newSortFilter : PV.Filters._mostRecentKey,
      page: queryPage ? queryPage : 1,
      includePodcast: true
    })
  }

  _queryData = async (
    filterKey: any,
    queryOptions: {
      isSubCategory?: boolean
      queryPage?: number
      searchAllFieldsText?: string
    } = {}
  ) => {
    let newState = {
      isLoading: false,
      isLoadingMore: false,
      isRefreshing: false,
      showNoInternetConnectionMessage: false
    } as State

    const hasInternetConnection = await hasValidNetworkConnection()

    if (!hasInternetConnection) {
      newState.showNoInternetConnectionMessage = true
      return newState
    }

    try {
      let { flatListData } = this.state
      const { queryFrom, querySort, selectedCategory, selectedCategorySub } = this.state
      const podcastId = this.global.session.userInfo.subscribedPodcastIds
      const { queryPage, searchAllFieldsText } = queryOptions

      flatListData = queryOptions && queryOptions.queryPage === 1 ? [] : flatListData

      if (filterKey === PV.Filters._subscribedKey) {
        const results = await getMediaRefs({
          sort: querySort,
          page: queryPage,
          podcastId,
          ...(searchAllFieldsText ? { searchAllFieldsText } : {}),
          subscribedOnly: true,
          includePodcast: true
        })
        newState.flatListData = [...flatListData, ...results[0]]
        newState.endOfResultsReached = newState.flatListData.length >= results[1]
        newState.flatListDataTotalCount = results[1]
      } else if (filterKey === PV.Filters._downloadedKey) {
        const downloadedEpisodeIdsObj = await getDownloadedEpisodeIds()
        const downloadedEpisodeIds = Object.keys(downloadedEpisodeIdsObj)
        const results = await getMediaRefs({
          sort: querySort,
          page: queryPage,
          episodeId: downloadedEpisodeIds,
          ...(searchAllFieldsText ? { searchAllFieldsText } : {}),
          subscribedOnly: true,
          includePodcast: true
        })
        newState.flatListData = [...flatListData, ...results[0]]
        newState.endOfResultsReached = newState.flatListData.length >= results[1]
        newState.flatListDataTotalCount = results[1]
      } else if (filterKey === PV.Filters._allPodcastsKey) {
        const results = await this._queryAllMediaRefs(querySort, queryPage)
        newState.flatListData = [...flatListData, ...results[0]]
        newState.endOfResultsReached = newState.flatListData.length >= results[1]
        newState.flatListDataTotalCount = results[1]
      } else if (PV.FilterOptions.screenFilters.ClipsScreen.sort.some((option) => option === filterKey)) {
        let results = []
        results = await getMediaRefs({
          ...setCategoryQueryProperty(queryFrom, selectedCategory, selectedCategorySub),
          ...(queryFrom === PV.Filters._subscribedKey ? { podcastId } : {}),
          sort: filterKey,
          ...(searchAllFieldsText ? { searchAllFieldsText } : {}),
          subscribedOnly: queryFrom === PV.Filters._subscribedKey,
          includePodcast: true
        })

        newState.flatListData = results[0]
        newState.endOfResultsReached = newState.flatListData.length >= results[1]
        newState.flatListDataTotalCount = results[1]
        newState = assignCategoryToStateForSortSelect(newState, selectedCategory, selectedCategorySub)
      } else {
        const assignedCategoryData = assignCategoryQueryToState(
          filterKey,
          newState,
          queryOptions,
          selectedCategory,
          selectedCategorySub
        )
        const categories = assignedCategoryData.categories
        filterKey = assignedCategoryData.newFilterKey
        newState = assignedCategoryData.newState

        const results = await this._queryMediaRefsByCategory(categories, querySort, queryPage)
        newState.flatListData = results[0]
        newState.endOfResultsReached = newState.flatListData.length >= results[1]
        newState.flatListDataTotalCount = results[1]
      }

      newState.selectedFilterLabel = await getSelectedFilterLabel(
        queryFrom,
        newState.selectedCategory,
        newState.selectedCategorySub
      )

      return newState
    } catch (error) {
      return newState
    }
  }

  _queryAllMediaRefs = async (sort: string | null, page: number = 1) => {
    const { searchBarText: searchAllFieldsText } = this.state
    const results = await getMediaRefs({
      sort,
      page,
      ...(searchAllFieldsText ? { searchAllFieldsText } : {}),
      includePodcast: true
    })

    return results
  }

  _queryMediaRefsByCategory = async (categoryId?: string | null, sort?: string | null, page: number = 1) => {
    const { searchBarText: searchAllFieldsText } = this.state
    const results = await getMediaRefs({
      categories: categoryId,
      sort,
      page,
      ...(searchAllFieldsText ? { searchAllFieldsText } : {}),
      includePodcast: true
    })
    return results
  }
}

const styles = {
  view: {
    flex: 1
  }
}
