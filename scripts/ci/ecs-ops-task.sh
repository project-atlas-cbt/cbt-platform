#!/usr/bin/env bash
# B23: run a one-off task from a release's ops image inside the VPC and fail
# unless it exits 0. The deploy workflow uses it to migrate before any
# service changes, and (staging only) to run the golden path.
#
#   scripts/ci/ecs-ops-task.sh <staging|production> <ops image URI> [command ...]
#
# With no command the image's own CMD runs (pnpm db:migrate:deploy). Needs
# AWS credentials for the environment's deploy role and its App stack.
set -euo pipefail
environment=$1
image=$2
shift 2

stack="Atlas-${environment}-App"
output() {
  aws cloudformation describe-stacks --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
cluster=$(output ClusterName)
family=$(output OpsTaskDefinition)
subnets=$(output TaskSubnets)
security_group=$(output TaskSecurityGroup)

# A new revision of the ops task definition carrying this release's image:
# the migration that runs is the one shipped with the code about to deploy.
aws ecs describe-task-definition --task-definition "$family" --query taskDefinition \
  | jq --arg image "$image" '
      .containerDefinitions[0].image = $image
      | {family, taskRoleArn, executionRoleArn, networkMode, containerDefinitions,
         requiresCompatibilities, cpu, memory, runtimePlatform}' > /tmp/ops-task.json
revision=$(aws ecs register-task-definition --cli-input-json file:///tmp/ops-task.json \
  --query taskDefinition.taskDefinitionArn --output text)

overrides='{}'
if [ "$#" -gt 0 ]; then
  overrides=$(jq -cn --args '{containerOverrides: [{name: "Ops", command: $ARGS.positional}]}' "$@")
fi

task=$(aws ecs run-task --cluster "$cluster" --task-definition "$revision" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${subnets}],securityGroups=[${security_group}],assignPublicIp=DISABLED}" \
  --overrides "$overrides" --started-by "github-${GITHUB_RUN_ID:-manual}" \
  --query 'tasks[0].taskArn' --output text)
echo "ops task $task (${*:-migrate})"

# `aws ecs wait tasks-stopped` gives up after 10 minutes; a migration on a
# production-sized dataset may take longer, so poll up to 60.
for _ in $(seq 1 360); do
  status=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task" \
    --query 'tasks[0].lastStatus' --output text)
  [ "$status" = STOPPED ] && break
  sleep 10
done

read -r exit_code reason < <(aws ecs describe-tasks --cluster "$cluster" --tasks "$task" \
  --query 'tasks[0].[containers[0].exitCode, stoppedReason]' --output text)
echo "ops task stopped: exit ${exit_code} (${reason})"
echo "logs: /atlas/${environment}/ops, stream ops/Ops/${task##*/}"
[ "$exit_code" = 0 ]
