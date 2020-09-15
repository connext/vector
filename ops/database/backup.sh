#!/bin/bash
set -e

project="vector"
bucket_name=backups.vector.connext.network
lifecycle=backup-lifecycle.json

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
timestamp="`date +"%y%m%d-%H%M%S"`"
backup_file=$timestamp.sql
backup_dir=$dir/snapshots
backup_path=$backup_dir/$backup_file
mkdir -p "`dirname $backup_path`"

echo "Creating database snapshot..."
pg_dump --username=$project $project > $backup_path
echo "Done backing up database, snapshot saved to: $backup_path"

if [[ -n "$AWS_ACCESS_KEY_ID" || -n "$AWS_SECRET_ACCESS_KEY" ]]
then

  # Create bucket if it doesn't exist
  if [[ -z "`aws s3api list-buckets | grep '"Name":' | grep "$bucket_name"`" ]]
  then
    echo "Creating bucket $bucket_name"
    aws s3api create-bucket --bucket $bucket_name
    if [[ -f "$lifecycle" ]]
    then
      echo "Setting bucke's lifecycle config..."
      aws s3api put-bucket-lifecycle-configuration \
        --bucket $bucket_name \
        --lifecycle-configuration file://$lifecycle
    else echo "Couldn't find lifecycle config file, skipping setup: $lifecycle"
    fi
  else
    echo "AWS S3 bucket $bucket_name already exists"
  fi

  echo "Uploading db snapshot to $bucket_name"
  aws s3 cp $backup_path s3://$bucket_name/backups/$backup_file --sse AES256
  echo "Done, snapshot has been stored remotely"

else
  echo "No access keys found, couldn't backup to remote storage"
fi

# Remove old backups
for snapshot in `find $backup_dir -type f | sort`
do
  # Safety measure: if a small number of snapshots remain, then stop deleting old ones
  if [[ "`find $backup_dir -type f`" -lt "24" ]]
  then exit;
  fi
  yymmdd="`echo $snapshot | cut -d "-" -f 2`"
  hhmmss="`echo $snapshot | sed 's/.*-\([0-9]\+\)\..*/\1/'`"
  twoDaysAgo="`date --date "2 days ago" "+%y%m%d"`"
  oneDayAgo="`date --date "1 day ago" "+%y%m%d"`"
  now="`date "+%H%M%S"`"
  # $((10#number)) strips leading zeros & prevents octal interpretation
  if [[ "$((10#$yymmdd))" -lt "$((10#$twoDaysAgo))" ]]
  then
    echo "Snapshot more than two days old, deleting: $snapshot"
    rm $snapshot
  elif [[ "$((10#$yymmdd))" -eq "$((10#$oneDayAgo))" ]]
  then
    if [[ "$((10#$hmmss))" -lt "$((10#$now))" ]]
    then
      echo "Snapshot more than 24 hours old, deleting: $snapshot"
      rm $snapshot
    fi
  fi
done
