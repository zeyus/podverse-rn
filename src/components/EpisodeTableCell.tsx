import React from 'react'
import { Image, StyleSheet, TouchableWithoutFeedback } from 'react-native'
import { DownloadStatus } from '../lib/downloader'
import { readableDate } from '../lib/utility'
import { PV } from '../resources'
import { button } from '../styles'
import { ActivityIndicator, Icon, Text, View } from './'

type Props = {
  description?: string
  downloads?: any
  handleMorePress?: any
  handleNavigationPress?: any
  id: string
  moreButtonAlignToTop?: boolean
  podcastImageUrl?: string
  podcastTitle?: string
  pubDate?: string
  title?: string
}

export const EpisodeTableCell = (props: Props) => {
  const { downloads = [], id, pubDate, description, title = 'untitled episode', handleMorePress,
  handleNavigationPress, podcastImageUrl, podcastTitle } = props

  const showPodcastInfo = !!podcastImageUrl && !!podcastTitle

  const innerTopView = (
    <View style={styles.innerTopView}>
      {
        !!podcastImageUrl &&
          <Image
            source={{ uri: podcastImageUrl }}
            style={styles.image} />
      }
      <View style={styles.textWrapper}>
        {
          !!podcastTitle &&
            <Text
              isSecondary={true}
              numberOfLines={1}
              style={styles.podcastTitle}>
              {podcastTitle}
            </Text>
        }
        <Text
          numberOfLines={2}
          style={styles.title}>
          {title}
        </Text>
        {
          !!pubDate &&
          <Text
            isSecondary={true}
            style={styles.pubDate}>
            {readableDate(pubDate)}
          </Text>
        }
      </View>
    </View>
  )

  const bottomText = (
    <Text
      numberOfLines={4}
      style={styles.description}>
      {description}
    </Text>
  )

  const moreButton = (
    <Icon
      name='ellipsis-h'
      onPress={handleMorePress}
      size={26}
      style={showPodcastInfo ? button.iconOnlyMedium : button.iconOnlySmall} />
  )

  let isDownloading = false
  const downloadingEpisode = downloads.find((x: any) => x.episodeId === id)

  if (downloadingEpisode && (downloadingEpisode.status === DownloadStatus.DOWNLOADING ||
    downloadingEpisode.status === DownloadStatus.PAUSED)) {
    isDownloading = true
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.wrapperTop}>
        {
          handleNavigationPress ?
            <TouchableWithoutFeedback onPress={handleNavigationPress}>
              {innerTopView}
            </TouchableWithoutFeedback> :
            innerTopView
        }
        {
          !isDownloading && handleMorePress && moreButton
        }
        {
          isDownloading &&
            <ActivityIndicator
              onPress={handleMorePress}
              styles={showPodcastInfo ? button.iconOnlyMedium : button.iconOnlySmall} />
        }
      </View>
      {
        !!description && handleNavigationPress &&
          <TouchableWithoutFeedback onPress={handleNavigationPress}>
            {bottomText}
          </TouchableWithoutFeedback>
      }
      {
        !!description && !handleNavigationPress && bottomText
      }
    </View>
  )
}

const styles = StyleSheet.create({
  description: {
    fontSize: PV.Fonts.sizes.md
  },
  image: {
    flex: 0,
    height: 60,
    marginRight: 12,
    width: 60
  },
  innerTopView: {
    flex: 1,
    flexDirection: 'row',
    marginRight: 4
  },
  podcastTitle: {
    flex: 0,
    fontSize: PV.Fonts.sizes.md,
    justifyContent: 'flex-start'
  },
  pubDate: {
    flex: 0,
    fontSize: PV.Fonts.sizes.md,
    justifyContent: 'flex-end',
    marginTop: 2
  },
  textWrapper: {
    flex: 1
  },
  title: {
    fontSize: PV.Fonts.sizes.md,
    fontWeight: PV.Fonts.weights.bold,
    marginTop: 2
  },
  wrapper: {
    paddingBottom: 12,
    paddingHorizontal: 8,
    paddingTop: 10
  },
  wrapperTop: {
    flexDirection: 'row',
    marginBottom: 8
  }
})
